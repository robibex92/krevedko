import crypto from "crypto";

/**
 * Middleware для защиты от дублирования запросов (idempotency)
 * Использует уникальный ключ (Idempotency-Key header) для отслеживания запросов
 * 
 * Принцип работы:
 * 1. Клиент генерирует уникальный ключ перед отправкой запроса
 * 2. При первом запросе с ключом - обрабатываем и сохраняем результат
 * 3. При повторном запросе с тем же ключом - возвращаем сохраненный результат
 * 4. Ключи хранятся 24 часа
 * 
 * @param {Object} options - Опции middleware
 * @param {number} options.ttlHours - Время жизни ключа в часах (по умолчанию 24)
 */
export function idempotencyMiddleware(options = {}) {
  const ttlHours = options.ttlHours || 24;

  return async (req, res, next) => {
    // Применяем только для POST, PUT, PATCH, DELETE
    const method = req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return next();
    }

    const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];
    
    // Если ключ не передан, продолжаем без проверки (backward compatibility)
    if (!idempotencyKey) {
      return next();
    }

    // Валидация формата ключа (должен быть UUID или random string)
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 256) {
      return res.status(400).json({
        error: "INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency-Key must be a string between 16 and 256 characters"
      });
    }

    const prisma = req.app?.locals?.prisma;
    if (!prisma) {
      console.error("[idempotency] Prisma not available");
      return next();
    }

    try {
      // Определяем пользователя/сессию
      const userId = req.user?.id || null;
      const sessionId = req.headers["x-session-id"] || null;

      // Создаем хеш запроса (endpoint + body)
      const endpoint = req.originalUrl || req.url;
      const requestBody = JSON.stringify(req.body || {});
      const requestHash = crypto
        .createHash("sha256")
        .update(`${endpoint}:${requestBody}`)
        .digest("hex");

      // Проверяем, существует ли ключ
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey }
      });

      if (existing) {
        // Проверка, что запрос от того же пользователя/сессии
        const isSameUser = 
          (userId && existing.userId === userId) ||
          (sessionId && existing.sessionId === sessionId) ||
          (!userId && !sessionId);

        if (!isSameUser) {
          return res.status(403).json({
            error: "IDEMPOTENCY_KEY_MISMATCH",
            message: "Idempotency key belongs to a different user"
          });
        }

        // Проверка, что это тот же запрос
        if (existing.requestHash !== requestHash) {
          return res.status(422).json({
            error: "IDEMPOTENCY_KEY_CONFLICT",
            message: "Idempotency key is already used for a different request"
          });
        }

        // Если запрос уже обработан, возвращаем сохраненный результат
        if (existing.responseStatus && existing.responseBody) {
          console.log(`[idempotency] Returning cached response for key: ${idempotencyKey.substring(0, 8)}...`);
          
          try {
            const cachedResponse = JSON.parse(existing.responseBody);
            return res.status(existing.responseStatus).json(cachedResponse);
          } catch (error) {
            console.error("[idempotency] Error parsing cached response:", error);
            // Если не можем распарсить, продолжаем обработку
          }
        }

        // Если запрос в процессе обработки (был создан недавно, но нет ответа)
        const processingThreshold = 60 * 1000; // 60 секунд
        const isProcessing = !existing.responseStatus && 
          (Date.now() - existing.createdAt.getTime() < processingThreshold);

        if (isProcessing) {
          return res.status(409).json({
            error: "REQUEST_IN_PROGRESS",
            message: "Request with this idempotency key is currently being processed"
          });
        }
      }

      // Создаем или обновляем запись
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ttlHours);

      if (!existing) {
        await prisma.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            userId,
            sessionId,
            endpoint,
            requestHash,
            expiresAt
          }
        });
      }

      // Перехватываем ответ
      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);
      let statusCode = 200;

      res.status = function(code) {
        statusCode = code;
        return originalStatus(code);
      };

      res.json = async function(body) {
        // Сохраняем результат в БД
        try {
          await prisma.idempotencyKey.update({
            where: { key: idempotencyKey },
            data: {
              responseStatus: statusCode,
              responseBody: JSON.stringify(body)
            }
          });
        } catch (error) {
          console.error("[idempotency] Error saving response:", error);
        }

        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error("[idempotency] Middleware error:", error);
      // При ошибке middleware продолжаем без защиты
      next();
    }
  };
}

/**
 * Очистка устаревших ключей idempotency (запускать периодически)
 */
export async function cleanupExpiredIdempotencyKeys(prisma) {
  // Проверка что prisma передан и инициализирован
  if (!prisma || !prisma.idempotencyKey) {
    console.warn("[idempotency] Cleanup skipped: Prisma not initialized");
    return 0;
  }

  try {
    const result = await prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    console.log(`[idempotency] Cleaned up ${result.count} expired keys`);
    return result.count;
  } catch (error) {
    console.error("[idempotency] Error cleaning up expired keys:", error);
    return 0;
  }
}


