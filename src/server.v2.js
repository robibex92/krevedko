import "dotenv/config";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";

// New architecture imports
import { configureContainer } from "./config/container.config.js";
import {
  errorHandler,
  notFoundHandler,
} from "./core/middleware/errorHandler.js";
import { createV2Routes, createAuthRoutes } from "./routes/v2/index.js";

// Old routes (backward compatibility - will be removed after full migration)
// import authRouter from "./routes/auth.js"; // MIGRATED to v2
// import favoritesRouter from "./routes/favorites.js"; // MIGRATED to v2
// import profileRouter from "./routes/profile.js"; // MIGRATED to v2
// import referralRouter from "./routes/referral.js"; // MIGRATED to v2
// import notificationsRouter from "./routes/notifications.js"; // MIGRATED to v2
// import publicReviewsRouter from "./routes/public-reviews.js"; // MIGRATED to v2
// import productFeedbackRouter from "./routes/product-feedback.js"; // MIGRATED to v2
// import publicRouter from "./routes/public.js"; // MIGRATED to v2 (health, recipes)
// import collectionsRouter from "./routes/collections.js"; // MIGRATED to v2 (collections, products)
// import verifyEmailRouter from "./routes/verify-email.js"; // MIGRATED to v2
// import adminRouter from "./routes/admin.js"; // MIGRATED to v2
import { csrfIssue, csrfProtect } from "./middleware/csrf.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { productUpload } from "./services/uploads.js";
import { processMessageQueue } from "./services/telegram-bot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read env with sensible defaults
const ENV = process.env;
const NODE_ENV = ENV.NODE_ENV || "development";
const API_URL = ENV.API_URL || null;

const app = express();
const prisma = new PrismaClient();

// Configure DI Container (prisma is now only accessible through DI)
const container = configureContainer(prisma);

// App locals (legacy support - will be removed gradually)
// app.locals.prisma = prisma; // REMOVED: Use DI container instead
app.locals.container = container;
app.locals.csrfSecrets = new Map();
app.locals.api = { baseUrl: API_URL, fetchJson: null };

// Ensure runtime folders exist
const uploadRoot = path.resolve(__dirname, "../uploads");
const uploadProductsDir = path.join(uploadRoot, "products");
const uploadPaymentsDir = path.join(uploadRoot, "payments");
const uploadAvatarsDir = path.join(uploadRoot, "avatars");
const uploadReviewsDir = path.join(uploadRoot, "reviews");
const uploadRecipesDir = path.join(uploadRoot, "recipes");
fs.mkdirSync(uploadProductsDir, { recursive: true });
fs.mkdirSync(uploadPaymentsDir, { recursive: true });
fs.mkdirSync(uploadAvatarsDir, { recursive: true });
fs.mkdirSync(uploadReviewsDir, { recursive: true });
fs.mkdirSync(uploadRecipesDir, { recursive: true });

// Core middlewares
app.set("trust proxy", 1);
app.use(morgan("dev"));
app.use(compression());

// Body parsing
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.options(
  "*",
  cors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  })
);

app.use(cookieParser());

// Static files
app.use(
  "/uploads",
  express.static(uploadRoot, {
    immutable: false,
    maxAge: "1d",
    fallthrough: true,
    setHeaders: (res, filePath) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// CSRF
app.get("/api/csrf", csrfIssue);
app.use((req, res, next) => {
  if (
    req.path === "/api/auth/refresh" ||
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/telegram/verify" ||
    req.path === "/api/auth/logout" ||
    req.path === "/api/test-upload"
  ) {
    return next();
  }
  csrfProtect(req, res, next);
});

// Public routes (MIGRATED to v2)
// app.use("/api", publicRouter);
// app.use("/api", verifyEmailRouter);

// NEW AUTH ROUTES (v2 - migrated to layered architecture)
app.use("/api/auth", createAuthRoutes(container));

// Email verification endpoint (GET /api/verify-email)
const authController = container.resolve("authController");
app.get("/api/verify-email", authController.verifyEmail);

// Example secured pings
app.get("/api/secure/ping", requireAuth, (_req, res) => res.json({ ok: true }));
app.get("/api/admin/ping", requireAuth, requireAdmin, (_req, res) =>
  res.json({ ok: true, role: "ADMIN" })
);

// Test upload endpoint
app.post("/api/test-upload", productUpload.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });
    const relPath = ["products", req.file.filename].join("/");
    res.json({
      ok: true,
      file: { ...req.file, relPath, url: `/uploads/${relPath}` },
    });
  } catch (e) {
    res.status(500).json({ error: "TEST_UPLOAD_FAILED", message: e?.message });
  }
});

// NEW V2 ROUTES (with layered architecture)
app.use("/api", createV2Routes(container));

// OLD ROUTES (backward compatibility - MIGRATED to v2)
// app.use("/api", adminRouter);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4002;
const HOST = process.env.HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () => {
  console.log(`[server] started on ${PORT}`);
  console.log(`[server] New layered architecture enabled`);
});

// Telegram bot message queue processor
let queueInterval = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log("[telegram-bot] Message queue processor enabled");
  queueInterval = setInterval(async () => {
    try {
      if (!prisma) {
        console.error("[telegram-bot] Prisma is undefined!");
        return;
      }
      await processMessageQueue(prisma);
    } catch (error) {
      console.error("Failed to process message queue:", error);
    }
  }, 10000);
} else {
  console.log(
    "[telegram-bot] Message queue processor disabled (no TELEGRAM_BOT_TOKEN)"
  );
}

async function shutdown(signal) {
  try {
    console.log(`[server] Received ${signal}, shutting down...`);
    if (queueInterval) {
      clearInterval(queueInterval);
      console.log("[telegram-bot] Queue processor stopped");
    }
    await prisma.$disconnect();
    server.close(() => {
      console.log("[server] HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      console.warn("[server] Force exiting after timeout");
      process.exit(1);
    }, 10000).unref();
  } catch (err) {
    process.exit(1);
  }
}

process.on("SIGINT", shutdown.bind(null, "SIGINT"));
process.on("SIGTERM", shutdown.bind(null, "SIGTERM"));
