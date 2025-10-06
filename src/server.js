import "dotenv/config";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import session from "express-session";
import cookieParser from "cookie-parser";
import connectSqlite3 from "connect-sqlite3";
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
import { productUpload } from "./services/uploads.js";
import referralRouter from "./routes/referral.js";
import adminRouter from "./routes/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read env with sensible defaults
const ENV = process.env;
const SESSION_SECRET = ENV.SESSION_SECRET || "change_me_in_env";
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
fs.mkdirSync(uploadProductsDir, { recursive: true });
fs.mkdirSync(uploadPaymentsDir, { recursive: true });
fs.mkdirSync(uploadAvatarsDir, { recursive: true });

const SQLiteStore = connectSqlite3(session);
const sessionDir = path.resolve(__dirname, "../.data");
fs.mkdirSync(sessionDir, { recursive: true });

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

// Sessions
app.use(
  session({
    name: "sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({ db: "sessions.sqlite", dir: sessionDir }),
    cookie: {
      httpOnly: true,
      sameSite: NODE_ENV === "production" ? "none" : "lax",
      secure: NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 дней
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
app.use("/api/auth", authRouter);

// Example secured pings
app.get("/api/secure/ping", requireAuth, (_req, res) => res.json({ ok: true }));
app.get("/api/admin/ping", requireAuth, requireAdmin, (_req, res) =>
  res.json({ ok: true, role: "ADMIN" })
);

// Test upload endpoint to validate file uploads independently of admin flows
app.post("/api/test-upload", productUpload.single("image"), (req, res) => {
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
app.use("/api", adminRouter);


app.get("/verify-email", (req, res) => {
  const { token, email } = req.query;
  
  // Редирект на фронтенд с теми же параметрами
  const frontendUrl = process.env.FRONTEND_ORIGIN;
  const redirectUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  
  res.redirect(redirectUrl);
});
// Centralized error handler
app.use(errorHandler);

// Start server + graceful shutdown (env PORT)
const PORT = parseInt(process.env.PORT, 10) || 4002;
const HOST = process.env.HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
  console.log(`[server] uploads dir: ${uploadRoot}`);
  console.log(
    `[server] FRONTEND_ORIGIN: ${process.env.FRONTEND_ORIGIN || "<not set>"}`
  );
});

async function shutdown(signal) {
  try {
    console.log(`[server] Received ${signal}, shutting down...`);
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
