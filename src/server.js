import "dotenv/config";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import session from "express-session";
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
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(compression());
app.use(express.json({ limit: `${Math.max(1, Number(UPLOAD_LIMIT_MB))}mb` }));
app.use(express.urlencoded({ extended: true }));

app.use(
  "/uploads",
  express.static(uploadRoot, {
    immutable: false,
    maxAge: "1d",
    fallthrough: true,
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
      sameSite: "lax",
      secure: NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// Rate limiters
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// Public and auth routers
app.use("/api", publicRouter);
app.use("/api/auth", authRouter);

// CSRF endpoints/middleware
app.get("/api/csrf", csrfIssue);
app.use(csrfProtect);

// Example secured pings
app.get("/api/secure/ping", requireAuth, (_req, res) => res.json({ ok: true }));
app.get("/api/admin/ping", requireAuth, requireAdmin, (_req, res) => res.json({ ok: true, role: "ADMIN" }));

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

// Centralized error handler
app.use(errorHandler);

// Start server + graceful shutdown (env PORT)
const PORT = parseInt(process.env.PORT, 10) || 4002;
const HOST = process.env.HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
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