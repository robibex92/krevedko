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
import authRouter from "./routes/auth.js";
import publicRouter from "./routes/public.js";
import { csrfIssue, csrfProtect } from "./middleware/csrf.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { apiFetchJson } from "./services/api.js";
import collectionsRouter from "./routes/collections.js";
import cartRouter from "./routes/cart.js";
import ordersRouter from "./routes/orders.js";
import favoritesRouter from "./routes/favorites.js";
import profileRouter from "./routes/profile.js";
import publicReviewsRouter from "./routes/public-reviews.js";
import productFeedbackRouter from "./routes/product-feedback.js";
import { productUploadBase } from "./services/uploads.js";
import referralRouter from "./routes/referral.js";
import adminRouter from "./routes/admin.js";
import notificationsRouter from "./routes/notifications.js";
import verifyEmailRouter from "./routes/verify-email.js";
import { processMessageQueue } from "./services/telegram-bot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read env with sensible defaults
const ENV = process.env;
const NODE_ENV = ENV.NODE_ENV || "development";
const UPLOAD_LIMIT_MB = parseInt(ENV.UPLOAD_LIMIT_MB || "5", 10);
const API_URL = ENV.API_URL || null;

const app = express();
const prisma = new PrismaClient();
app.locals.prisma = prisma;
app.locals.csrfSecrets = new Map(); // sid -> secret

app.locals.api = { baseUrl: API_URL, fetchJson: apiFetchJson };

// Ensure runtime folders exist (uploads, session store)
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

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN, // https://test.sibroot.ru
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
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  "/uploads",
  express.static(uploadRoot, {
    immutable: false,
    maxAge: "1d",
    fallthrough: true,
    setHeaders: (res, filePath) => {
      // Allow cross-origin embedding of images/files
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

// CSRF endpoints/middleware
app.get("/api/csrf", csrfIssue);

// Apply CSRF protection with exception for auth endpoints that don't rely on session CSRF
app.use((req, res, next) => {
  // Skip CSRF for auth endpoints that use JWT or secure refresh cookie
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

// Public and auth routers
app.use("/api", publicRouter);
app.use("/api", verifyEmailRouter);
app.use("/api/auth", authRouter);

// Example secured pings
app.get("/api/secure/ping", requireAuth, (_req, res) => res.json({ ok: true }));
app.get("/api/admin/ping", requireAuth, requireAdmin, (_req, res) =>
  res.json({ ok: true, role: "ADMIN" })
);

// Test upload endpoint to validate file uploads independently of admin flows
app.post("/api/test-upload", productUploadBase.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });
    console.log("[test-upload] file received", {
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
    });
    // Expose relative path under /uploads static mount
    const relPath = ["products", req.file.filename].join("/");
    res.json({
      ok: true,
      file: { ...req.file, relPath, url: `/uploads/${relPath}` },
    });
  } catch (e) {
    res
      .status(500)
      .json({ error: "TEST_UPLOAD_FAILED", message: e?.message || String(e) });
  }
});

// Domain routers
app.use("/api", collectionsRouter);
app.use("/api", cartRouter);
app.use("/api", ordersRouter);
app.use("/api", favoritesRouter);
app.use("/api", profileRouter);
app.use("/api", publicReviewsRouter);
app.use("/api", productFeedbackRouter);
app.use("/api", referralRouter);
app.use("/api", notificationsRouter);
app.use("/api", adminRouter);

// Centralized error handler
app.use(errorHandler);

// Start server + graceful shutdown (env PORT)
const PORT = process.env.PORT || 4002;
const HOST = process.env.HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () => {
  console.log(`[server] started on ${PORT}`);
});

// Telegram bot message queue processor
let queueInterval = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log("[telegram-bot] Message queue processor enabled");
  // Обрабатываем очередь каждые 10 секунд
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
