/**
 * Rate Limiting Middleware
 * Защита от spam запросов и DDoS атак
 * 
 * Использует простую in-memory стратегию с sliding window
 * Для production рекомендуется использовать Redis
 */

// In-memory хранилище (для простоты, в production лучше Redis)
const requestCounts = new Map();

/**
 * Очистка старых записей (запускается периодически)
 */
function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > data.windowMs) {
      requestCounts.delete(key);
    }
  }
}

// Очистка каждые 5 минут
setInterval(cleanupOldEntries, 5 * 60 * 1000);

/**
 * Rate limiter middleware с sliding window algorithm
 * 
 * @param {Object} options - Опции
 * @param {number} options.windowMs - Окно времени в миллисекундах (по умолчанию 60000 = 1 минута)
 * @param {number} options.max - Максимальное количество запросов в окне (по умолчанию 100)
 * @param {string} options.message - Сообщение об ошибке
 * @param {Function} options.keyGenerator - Функция для генерации ключа (по умолчанию IP)
 * @param {boolean} options.skipSuccessfulRequests - Не учитывать успешные запросы (по умолчанию false)
 */
export function rateLimitMiddleware(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 минута
    max = 100, // 100 запросов в минуту
    message = "Too many requests, please try again later",
    keyGenerator = (req) => {
      // Используем IP из различных источников
      return req.ip || 
             req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
             req.headers["x-real-ip"] ||
             req.connection?.remoteAddress ||
             "unknown";
    },
    skipSuccessfulRequests = false
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    if (!requestCounts.has(key)) {
      requestCounts.set(key, {
        count: 1,
        windowStart: now,
        windowMs
      });
      return next();
    }

    const record = requestCounts.get(key);
    const timeSinceWindowStart = now - record.windowStart;

    // Если вышли за окно, сбрасываем счетчик
    if (timeSinceWindowStart > windowMs) {
      record.count = 1;
      record.windowStart = now;
      return next();
    }

    // Проверяем лимит
    if (record.count >= max) {
      const retryAfter = Math.ceil((windowMs - timeSinceWindowStart) / 1000);
      
      console.warn(`[rate-limit] Rate limit exceeded for ${key} (${record.count}/${max} requests)`);
      
      res.set("Retry-After", String(retryAfter));
      res.set("X-RateLimit-Limit", String(max));
      res.set("X-RateLimit-Remaining", "0");
      res.set("X-RateLimit-Reset", String(Math.ceil((record.windowStart + windowMs) / 1000)));
      
      return res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        message,
        retryAfter: retryAfter
      });
    }

    // Увеличиваем счетчик
    record.count++;

    // Устанавливаем заголовки
    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(Math.max(0, max - record.count)));
    res.set("X-RateLimit-Reset", String(Math.ceil((record.windowStart + windowMs) / 1000)));

    // Если нужно не учитывать успешные запросы
    if (skipSuccessfulRequests) {
      const originalJson = res.json.bind(res);
      res.json = function(body) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          record.count--;
        }
        return originalJson(body);
      };
    }

    next();
  };
}

/**
 * Предустановленные конфигурации rate limiting
 * 
 * Лимиты настроены так, чтобы не мешать обычным пользователям,
 * но защищать от реальных атак
 */
export const rateLimiters = {
  // Лимит для аутентификации (защита от брутфорса)
  // Увеличен до 10 попыток - обычный пользователь может ошибиться несколько раз
  auth: rateLimitMiddleware({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 10, // 10 попыток (было 5)
    message: "Слишком много попыток входа. Пожалуйста, повторите через 15 минут"
  }),

  // Лимит для создания заказов
  // Увеличен до 20 - пользователь может создавать несколько заказов подряд
  orders: rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 минута
    max: 20, // 20 заказов в минуту (было 10)
    message: "Слишком много заказов. Пожалуйста, подождите минуту"
  }),

  // Общий лимит для API
  // Увеличен до 300 - для активного использования сайта
  api: rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 минута
    max: 300, // 300 запросов в минуту (было 100)
    message: "Слишком много запросов. Пожалуйста, подождите"
  }),

  // Лимит для загрузки файлов
  // Увеличен до 20
  upload: rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 минута
    max: 20, // 20 загрузок в минуту (было 10)
    message: "Слишком много загрузок. Пожалуйста, подождите"
  })
};

/**
 * Получить статистику rate limiting
 */
export function getRateLimitStats() {
  const stats = {
    totalKeys: requestCounts.size,
    entries: []
  };

  for (const [key, data] of requestCounts.entries()) {
    stats.entries.push({
      key,
      count: data.count,
      windowStart: new Date(data.windowStart),
      windowMs: data.windowMs
    });
  }

  return stats;
}


