import { Router } from "express";

const router = Router();

/**
 * Health Check endpoints для мониторинга состояния сервера
 */

/**
 * GET /health
 * Простая проверка доступности сервера
 * Используется load balancer'ами и мониторингом
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/detailed
 * Детальная информация о состоянии сервера
 * Проверяет подключение к БД и другие зависимости
 */
router.get("/health/detailed", async (req, res) => {
  const prisma = req.app?.locals?.prisma;

  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: "MB",
    },
    checks: {
      database: { status: "unknown" },
      telegram: { status: "unknown" },
    },
  };

  // Проверка БД
  try {
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
      health.checks.database = { status: "ok", message: "Connected" };
    } else {
      health.checks.database = {
        status: "error",
        message: "Prisma not initialized",
      };
      health.status = "degraded";
    }
  } catch (error) {
    health.checks.database = {
      status: "error",
      message: error.message || "Database connection failed",
    };
    health.status = "degraded";
  }

  // Проверка Telegram Bot
  if (process.env.TELEGRAM_BOT_TOKEN) {
    health.checks.telegram = { status: "ok", message: "Configured" };
  } else {
    health.checks.telegram = { status: "warning", message: "Not configured" };
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/ready
 * Проверка готовности сервера к обработке запросов
 * Используется Kubernetes readiness probe
 */
router.get("/health/ready", async (req, res) => {
  const prisma = req.app?.locals?.prisma;

  try {
    // Проверяем критичные зависимости
    if (!prisma) {
      throw new Error("Prisma not initialized");
    }

    // Проверяем подключение к БД
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * GET /health/live
 * Проверка "живости" сервера
 * Используется Kubernetes liveness probe
 * Просто отвечает 200 если процесс жив
 */
router.get("/health/live", (req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/metrics
 * Метрики для мониторинга (Prometheus-style)
 */
router.get("/health/metrics", (req, res) => {
  const mem = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const metrics = {
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    memory: {
      heap_used_bytes: mem.heapUsed,
      heap_total_bytes: mem.heapTotal,
      external_bytes: mem.external,
      rss_bytes: mem.rss,
    },
    cpu: {
      user_microseconds: cpuUsage.user,
      system_microseconds: cpuUsage.system,
    },
    process: {
      pid: process.pid,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  res.status(200).json(metrics);
});

export default router;
