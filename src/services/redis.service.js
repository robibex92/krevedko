import { createClient } from "redis";

/**
 * Redis Service для кеширования (ES Module версия)
 *
 * Используется для:
 * - Кеширование каталога товаров
 * - Кеширование категорий
 * - Кеширование аналитики
 * - Rate Limiting (опционально)
 */
class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isEnabled = process.env.REDIS_ENABLED === "true";
  }

  /**
   * Подключиться к Redis
   */
  async connect() {
    if (!this.isEnabled) {
      console.log("[redis] Redis отключен в .env (REDIS_ENABLED=false)");
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error("[redis] Слишком много попыток переподключения");
              return new Error("Too many retries");
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on("error", (err) => {
        console.error("[redis] Ошибка:", err);
        this.isConnected = false;
      });

      this.client.on("connect", () => {
        console.log("[redis] Подключение к Redis...");
      });

      this.client.on("ready", () => {
        console.log("[redis] ✅ Redis готов к использованию");
        this.isConnected = true;
      });

      this.client.on("reconnecting", () => {
        console.log("[redis] Переподключение к Redis...");
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error("[redis] Ошибка подключения:", error.message);
      this.isEnabled = false;
      this.isConnected = false;
    }
  }

  /**
   * Отключиться от Redis
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log("[redis] Отключено");
    }
  }

  /**
   * Проверить доступность Redis
   */
  isAvailable() {
    return this.isEnabled && this.isConnected;
  }

  /**
   * Получить значение из кеша
   */
  async get(key) {
    if (!this.isAvailable()) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value);
    } catch (error) {
      console.error(`[redis] Ошибка при get(${key}):`, error);
      return null;
    }
  }

  /**
   * Сохранить значение в кеш
   */
  async set(key, value, ttl = 300) {
    if (!this.isAvailable()) return false;

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      return true;
    } catch (error) {
      console.error(`[redis] Ошибка при set(${key}):`, error);
      return false;
    }
  }

  /**
   * Удалить ключ из кеша
   */
  async del(key) {
    if (!this.isAvailable()) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`[redis] Ошибка при del(${key}):`, error);
      return false;
    }
  }

  /**
   * Удалить все ключи по шаблону
   */
  async delPattern(pattern) {
    if (!this.isAvailable()) return 0;

    try {
      const keys = [];
      for await (const key of this.client.scanIterator({
        MATCH: pattern,
        COUNT: 100,
      })) {
        keys.push(key);
      }

      if (keys.length === 0) return 0;

      await this.client.del(keys);
      return keys.length;
    } catch (error) {
      console.error(`[redis] Ошибка при delPattern(${pattern}):`, error);
      return 0;
    }
  }

  /**
   * Инвалидировать кеш каталога товаров
   */
  async invalidateProductsCache() {
    const count = await this.delPattern("products:*");
    if (count > 0) {
      console.log(`[redis] Инвалидирован кеш товаров (${count} ключей)`);
    }
  }

  /**
   * Инвалидировать кеш категорий
   */
  async invalidateCategoriesCache() {
    const count = await this.delPattern("categories:*");
    if (count > 0) {
      console.log(`[redis] Инвалидирован кеш категорий (${count} ключей)`);
    }
  }

  /**
   * Инвалидировать кеш аналитики
   */
  async invalidateAnalyticsCache() {
    const count = await this.delPattern("analytics:*");
    if (count > 0) {
      console.log(`[redis] Инвалидирован кеш аналитики (${count} ключей)`);
    }
  }

  /**
   * Очистить весь кеш
   */
  async flushAll() {
    if (!this.isAvailable()) return false;

    try {
      await this.client.flushAll();
      console.log("[redis] Весь кеш очищен");
      return true;
    } catch (error) {
      console.error("[redis] Ошибка при flushAll:", error);
      return false;
    }
  }

  /**
   * Получить статистику кеша
   */
  async getStats() {
    if (!this.isAvailable()) {
      return {
        enabled: false,
        connected: false,
      };
    }

    try {
      const info = await this.client.info("stats");
      const dbSize = await this.client.dbSize();

      return {
        enabled: true,
        connected: true,
        totalKeys: dbSize,
        info: this.parseRedisInfo(info),
      };
    } catch (error) {
      console.error("[redis] Ошибка при getStats:", error);
      return {
        enabled: true,
        connected: false,
        error: error.message,
      };
    }
  }

  parseRedisInfo(info) {
    const lines = info.split("\r\n");
    const stats = {};

    for (const line of lines) {
      if (line && !line.startsWith("#")) {
        const [key, value] = line.split(":");
        if (key && value) {
          stats[key] = value;
        }
      }
    }

    return stats;
  }
}

// Singleton instance
const redisService = new RedisService();

export default redisService;
