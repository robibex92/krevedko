const redisService = require("../services/redis");

/**
 * Middleware для кеширования HTTP ответов
 *
 * @param {string} keyPrefix - префикс для ключа кеша (например, "products", "analytics")
 * @param {number} ttl - время жизни кеша в секундах (по умолчанию 300 = 5 минут)
 * @param {function} keyGenerator - функция для генерации ключа кеша из req
 *
 * @example
 * router.get('/products',
 *   cacheMiddleware('products', 300, (req) => `collection:${req.query.collectionId}`),
 *   productController.getProducts
 * );
 */
function cacheMiddleware(keyPrefix, ttl = 300, keyGenerator = null) {
  return async (req, res, next) => {
    // Если Redis недоступен, пропускаем кеширование
    if (!redisService.isAvailable()) {
      return next();
    }

    try {
      // Генерация ключа кеша
      const cacheKey = keyGenerator
        ? `${keyPrefix}:${keyGenerator(req)}`
        : `${keyPrefix}:${req.originalUrl}`;

      // Попытка получить из кеша
      const cached = await redisService.get(cacheKey);

      if (cached) {
        console.log(`[cache] HIT: ${cacheKey}`);
        return res.json(cached);
      }

      console.log(`[cache] MISS: ${cacheKey}`);

      // Перехват оригинального res.json для сохранения в кеш
      const originalJson = res.json.bind(res);

      res.json = (data) => {
        // Сохранить в кеш только если ответ успешный
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisService.set(cacheKey, data, ttl).catch((err) => {
            console.error(`[cache] Ошибка сохранения в кеш: ${err}`);
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error("[cache] Ошибка middleware:", error);
      next();
    }
  };
}

/**
 * Инвалидация кеша после мутаций
 *
 * @param {string[]} patterns - массив шаблонов для удаления (например, ['products:*', 'analytics:*'])
 *
 * @example
 * router.post('/products',
 *   authenticate,
 *   productController.createProduct,
 *   invalidateCacheMiddleware(['products:*', 'analytics:*'])
 * );
 */
function invalidateCacheMiddleware(patterns) {
  return async (req, res, next) => {
    // Выполняем инвалидацию после отправки ответа
    res.on("finish", async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        for (const pattern of patterns) {
          const count = await redisService.delPattern(pattern);
          if (count > 0) {
            console.log(`[cache] Invalidated: ${pattern} (${count} keys)`);
          }
        }
      }
    });

    next();
  };
}

/**
 * Кеширование для конкретных endpoint'ов
 */
const cachePresets = {
  /**
   * Кеш каталога товаров (5 минут)
   */
  products: (collectionId) =>
    cacheMiddleware("products", 300, (req) => {
      const cid =
        collectionId || req.query.collectionId || req.params.collectionId;
      const category = req.query.category || "all";
      return `${cid}:${category}`;
    }),

  /**
   * Кеш категорий (1 час)
   */
  categories: () => cacheMiddleware("categories", 3600),

  /**
   * Кеш сборов (10 минут)
   */
  collections: () => cacheMiddleware("collections", 600),

  /**
   * Кеш аналитики (15 минут)
   */
  analytics: (period) =>
    cacheMiddleware("analytics", 900, (req) => {
      const p = period || req.query.period || "7d";
      const start = req.query.startDate || "";
      const end = req.query.endDate || "";
      return `${p}:${start}:${end}`;
    }),

  /**
   * Кеш одного товара (10 минут)
   */
  product: () => cacheMiddleware("product", 600, (req) => req.params.id),

  /**
   * Кеш рецептов (30 минут)
   */
  recipes: () => cacheMiddleware("recipes", 1800),
};

module.exports = {
  cacheMiddleware,
  invalidateCacheMiddleware,
  cachePresets,
};
