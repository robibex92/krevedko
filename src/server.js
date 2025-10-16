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
import passport from "passport";

// New architecture imports
import { configureContainer } from "./config/container.config.js";
import {
  errorHandler,
  notFoundHandler,
} from "./core/middleware/errorHandler.js";
import { createV2Routes, createAuthRoutes } from "./routes/v2/index.js";
import { createOAuthRoutes } from "./routes/v2/oauth.routes.js";

// OAuth strategies
import { configureGoogleStrategy } from "./auth/strategies/google.strategy.js";
import { configureYandexStrategy } from "./auth/strategies/yandex.strategy.js";
import { configureMailRuStrategy } from "./auth/strategies/mailru.strategy.js";

import { csrfIssue, csrfProtect } from "./middleware/csrf.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { productUploadBase } from "./services/uploads.js";
import { processMessageQueue } from "./services/telegram-bot.js";

// Security middlewares
import {
  idempotencyMiddleware,
  cleanupExpiredIdempotencyKeys,
} from "./middleware/idempotency.js";

// Redis service
import redisService from "./services/redis.service.js";
import { rateLimiters } from "./middleware/rateLimit.js";
import { sanitizeInput } from "./middleware/inputSanitization.js";
import { securityLogger } from "./middleware/securityLogger.js";
import { requestIdMiddleware, requestLogger } from "./middleware/requestId.js";
import { OrderAutoCompletionCron } from "./services/OrderAutoCompletionCron.js";
import {
  securityAuditMiddleware,
  suspiciousActivityMiddleware,
  ipWhitelistMiddleware,
} from "./middleware/securityAudit.js";

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

// Configure Passport.js OAuth strategies
const oauthService = container.resolve("oauthService");
configureGoogleStrategy(passport, oauthService);
configureYandexStrategy(passport, oauthService);
configureMailRuStrategy(passport, oauthService);

// App locals (legacy support - will be removed gradually)
app.locals.prisma = prisma; // ✅ Required for legacy routes (auth, cart, favorites, etc.)
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

// Helmet security headers (ослабленные настройки для лучшего UX)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        connectSrc: ["'self'", "https://api.telegram.org"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false, // Отключаем для лучшей совместимости
    crossOriginOpenerPolicy: false, // Отключаем для лучшей совместимости
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Разрешаем кросс-доменные ресурсы
  })
);

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

// Initialize Passport (for OAuth)
app.use(passport.initialize());

// ===== SECURITY MIDDLEWARES =====
// 0. Request ID (должен быть самым первым для трейсинга)
app.use(requestIdMiddleware);
app.use(requestLogger);

// 1. Security logging (должен быть первым для логирования всех запросов)
app.use(securityLogger);

// 2. Input sanitization (очистка входных данных от XSS и injection)
app.use(sanitizeInput);

// 3. Security audit and suspicious activity detection
app.use(securityAuditMiddleware);
app.use(suspiciousActivityMiddleware);

// 4. Idempotency protection (защита от дублирования запросов)
app.use(idempotencyMiddleware());

// 5. Rate limiting (защита от DDoS и spam)
// Строгий лимит только для аутентификации (защита от брутфорса)
app.use("/api/auth/login", rateLimiters.auth);
app.use("/api/auth/register", rateLimiters.auth);
// Средний лимит для создания заказов
app.use("/api/orders", rateLimiters.orders);
app.use("/api/guest/orders", rateLimiters.orders);
// Мягкий лимит для GET запросов (чтение данных)
app.use((req, res, next) => {
  if (req.method === "GET") {
    return rateLimiters.read(req, res, next);
  }
  next();
});
// Более строгий лимит для POST/PUT/DELETE запросов (изменение данных)
app.use((req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return rateLimiters.write(req, res, next);
  }
  next();
});
// ===== END SECURITY MIDDLEWARES =====

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

// Health check endpoints (должны быть ДО middleware безопасности)
import healthRouter from "./routes/health.js";
app.use("/", healthRouter);

// CSRF
app.get("/api/csrf", csrfIssue);
app.use((req, res, next) => {
  if (
    req.path === "/api/auth/refresh" ||
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/telegram/verify" ||
    req.path === "/api/auth/logout" ||
    req.path === "/api/test-upload" ||
    req.path.startsWith("/api/auth/oauth/") || // Skip CSRF for OAuth
    req.path.startsWith("/health") // Skip CSRF for health checks
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
app.post("/api/test-upload", productUploadBase.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });
    const relPath = ["products", req.file.filename].join("/");
    res.json({
      ok: true,
      file: { ...req.file, relPath, url: `/uploads/${relPath}` },
      message: "Image uploaded with watermark 'Ля Креведко'",
    });
  } catch (e) {
    res.status(500).json({ error: "TEST_UPLOAD_FAILED", message: e?.message });
  }
});

// NEW V2 ROUTES (with layered architecture)
app.use("/api", createV2Routes(container));

// Временный тестовый маршрут для отладки
app.get("/api/test-server", (req, res) => {
  res.json({ message: "Server is working with new changes!", timestamp: new Date().toISOString() });
});

// OAuth routes (Google, Yandex, Mail.ru)
app.use("/api", createOAuthRoutes(container));

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

// Initialize Redis (с задержкой после подключения к БД)
setTimeout(async () => {
  try {
    await redisService.connect();
  } catch (error) {
    console.error("[redis] Failed to initialize:", error);
  }
}, 5000);

// Periodic cleanup of expired idempotency keys (каждые 6 часов)
let cleanupInterval = null;
console.log("[security] Idempotency keys cleanup enabled");
cleanupInterval = setInterval(
  async () => {
    try {
      await cleanupExpiredIdempotencyKeys(prisma);
    } catch (error) {
      console.error("[security] Failed to cleanup idempotency keys:", error);
    }
  },
  6 * 60 * 60 * 1000
); // 6 hours

// Order auto-completion cron job
const orderAutoCompletionCron = new OrderAutoCompletionCron();

// Initial cleanup on startup (с задержкой 10 секунд для подключения к БД)
setTimeout(() => {
  cleanupExpiredIdempotencyKeys(prisma).catch((err) =>
    console.error("[security] Initial cleanup failed:", err)
  );

  // Запускаем cron job для автоматического завершения заказов
  orderAutoCompletionCron.start({
    intervalHours: 24, // Проверяем каждый день
    runAtHour: 2, // В 2:00 ночи
  });
}, 10000);

async function shutdown(signal) {
  try {
    console.log(`[server] Received ${signal}, shutting down...`);
    if (queueInterval) {
      clearInterval(queueInterval);
      console.log("[telegram-bot] Queue processor stopped");
    }
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      console.log("[security] Cleanup processor stopped");
    }
    orderAutoCompletionCron.stop();
    console.log("[order-auto-completion] Cron job stopped");
    await redisService.disconnect();
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
