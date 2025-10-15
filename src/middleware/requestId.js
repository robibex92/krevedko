import crypto from "crypto";

/**
 * Middleware для добавления уникального Request ID к каждому запросу
 * Позволяет отслеживать запросы через все логи и сервисы
 *
 * Request ID передается через:
 * - X-Request-ID header (если клиент передал)
 * - Генерируется автоматически если не передан
 * - Добавляется в response headers
 * - Добавляется в req.requestId
 *
 * @example
 * // В логах
 * console.log(`[${req.requestId}] Processing order...`);
 *
 * // В ошибках
 * console.error(`[${req.requestId}] Error:`, error);
 *
 * // На клиенте
 * // Response headers: X-Request-ID: abc123-def456-ghi789
 */
export function requestIdMiddleware(req, res, next) {
  // Проверяем, передал ли клиент Request ID
  let requestId = req.headers["x-request-id"];

  // Если не передал - генерируем новый
  if (!requestId || typeof requestId !== "string") {
    requestId = generateRequestId();
  } else {
    // Валидируем формат (только буквы, цифры, дефисы, максимум 64 символа)
    if (!/^[a-zA-Z0-9\-]{1,64}$/.test(requestId)) {
      requestId = generateRequestId();
    }
  }

  // Добавляем в request
  req.requestId = requestId;

  // Добавляем в response headers
  res.setHeader("X-Request-ID", requestId);

  // Для удобства добавляем метод логирования с Request ID
  req.log = {
    info: (...args) => console.log(`[${requestId}]`, ...args),
    warn: (...args) => console.warn(`[${requestId}]`, ...args),
    error: (...args) => console.error(`[${requestId}]`, ...args),
    debug: (...args) => {
      if (process.env.NODE_ENV === "development") {
        console.log(`[${requestId}]`, ...args);
      }
    },
  };

  next();
}

/**
 * Генерация уникального Request ID
 * Формат: timestamp-random (например: 1697123456789-a1b2c3d4)
 */
function generateRequestId() {
  const timestamp = Date.now().toString(36); // Base36 для компактности
  const random = crypto.randomBytes(4).toString("hex");
  return `${timestamp}-${random}`;
}

/**
 * Middleware для логирования запросов с Request ID
 * Улучшенная версия morgan с Request ID
 */
export function requestLogger(req, res, next) {
  const start = Date.now();

  // Логируем начало запроса
  const userInfo = req.user ? `[User: ${req.user.id}]` : "[Guest]";
  console.log(
    `[requestLogger] Logging request: ${req.method} ${req.originalUrl || req.url} ${userInfo}`
  );
  req.log.info(`→ ${req.method} ${req.originalUrl || req.url}`, userInfo);

  // Перехватываем окончание запроса
  const originalSend = res.send.bind(res);
  res.send = function (body) {
    const duration = Date.now() - start;
    const statusColor =
      res.statusCode >= 400 ? "🔴" : res.statusCode >= 300 ? "🟡" : "🟢";

    req.log.info(
      `${statusColor} ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`
    );

    return originalSend(body);
  };

  next();
}

/**
 * Helper для добавления Request ID в error responses
 */
export function includeRequestIdInError(err, req, res, next) {
  // Добавляем Request ID в ошибку
  if (err && req.requestId) {
    err.requestId = req.requestId;

    // Если это API ошибка, добавляем в response
    if (res.headersSent) {
      return next(err);
    }

    const errorResponse = {
      error: err.code || err.name || "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred",
      requestId: req.requestId,
    };

    // В development добавляем stack trace
    if (process.env.NODE_ENV === "development") {
      errorResponse.stack = err.stack;
    }

    res.status(err.statusCode || 500).json(errorResponse);
  } else {
    next(err);
  }
}
