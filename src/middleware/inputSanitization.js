/**
 * Input Sanitization Middleware
 * Защита от XSS, injection и других атак через пользовательский ввод
 */

/**
 * Рекурсивно очищает строки от потенциально опасных символов
 */
function sanitizeString(value) {
  if (typeof value !== "string") return value;

  // Удаляем null bytes (могут вызвать проблемы с C-библиотеками)
  let cleaned = value.replace(/\0/g, "");

  // Удаляем или экранируем HTML теги (защита от XSS)
  // Заменяем < > на HTML entities
  cleaned = cleaned
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Удаляем опасные JavaScript escape последовательности
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  // Ограничиваем длину (защита от DoS через огромные строки)
  const MAX_STRING_LENGTH = 10000;
  if (cleaned.length > MAX_STRING_LENGTH) {
    cleaned = cleaned.substring(0, MAX_STRING_LENGTH);
  }

  return cleaned;
}

/**
 * Рекурсивно проходит по объекту и очищает все строки
 */
function sanitizeObject(obj, depth = 0) {
  // Защита от бесконечной рекурсии
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) return obj;

  if (obj === null || obj === undefined) return obj;

  // Массив
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  // Объект
  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Очищаем ключи (защита от prototype pollution)
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        console.warn(`[sanitization] Blocked dangerous key: ${key}`);
        continue;
      }

      sanitized[key] = sanitizeObject(value, depth + 1);
    }
    return sanitized;
  }

  // Строка
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  // Примитивы (number, boolean, etc)
  return obj;
}

/**
 * Middleware для очистки входных данных
 * Применяется к req.body, req.query, req.params
 */
export function sanitizeInput(req, res, next) {
  try {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body);
    }

    if (req.query && typeof req.query === "object") {
      req.query = sanitizeObject(req.query);
    }

    if (req.params && typeof req.params === "object") {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error("[sanitization] Error sanitizing input:", error);
    // При ошибке возвращаем 400
    res.status(400).json({
      error: "INVALID_INPUT",
      message: "Input data contains invalid characters"
    });
  }
}

/**
 * Валидация специфичных полей
 */
export const validators = {
  /**
   * Проверка email
   */
  email: (value) => {
    if (typeof value !== "string") return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) && value.length <= 254;
  },

  /**
   * Проверка телефона (международный формат)
   */
  phone: (value) => {
    if (typeof value !== "string") return false;
    // Разрешаем +, цифры, пробелы, дефисы, скобки
    const phoneRegex = /^[\d\s\-+()]{7,20}$/;
    return phoneRegex.test(value);
  },

  /**
   * Проверка URL
   */
  url: (value) => {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  },

  /**
   * Проверка числа (положительное)
   */
  positiveNumber: (value) => {
    const num = Number(value);
    return !isNaN(num) && num > 0 && isFinite(num);
  },

  /**
   * Проверка числа (неотрицательное)
   */
  nonNegativeNumber: (value) => {
    const num = Number(value);
    return !isNaN(num) && num >= 0 && isFinite(num);
  },

  /**
   * Проверка UUID v4
   */
  uuidV4: (value) => {
    if (typeof value !== "string") return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  /**
   * Проверка длины строки
   */
  stringLength: (value, min, max) => {
    if (typeof value !== "string") return false;
    return value.length >= min && value.length <= max;
  },

  /**
   * Проверка на SQL injection паттерны (дополнительная защита)
   */
  noSqlInjection: (value) => {
    if (typeof value !== "string") return true;
    
    // Опасные SQL паттерны
    const dangerousPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
      /(--|#|\/\*|\*\/)/,  // SQL комментарии
      /(\bOR\b.*=.*)/i,     // OR injection
      /(\bUNION\b.*\bSELECT\b)/i  // UNION injection
    ];

    return !dangerousPatterns.some(pattern => pattern.test(value));
  }
};

/**
 * Middleware для валидации специфичных полей в body
 * 
 * @param {Object} schema - Схема валидации { fieldName: validatorFunction }
 * 
 * Пример:
 * validateFields({
 *   email: validators.email,
 *   phone: validators.phone,
 *   amount: validators.positiveNumber
 * })
 */
export function validateFields(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, validator] of Object.entries(schema)) {
      const value = req.body?.[field];
      
      // Пропускаем необязательные поля (undefined)
      if (value === undefined) continue;

      if (!validator(value)) {
        errors.push({
          field,
          message: `Invalid ${field} format`
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid input data",
        details: errors
      });
    }

    next();
  };
}

/**
 * Middleware для проверки обязательных полей
 */
export function requireFields(...fields) {
  return (req, res, next) => {
    const missing = [];

    for (const field of fields) {
      if (req.body?.[field] === undefined || req.body?.[field] === null || req.body?.[field] === "") {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: "REQUIRED_FIELDS_MISSING",
        message: "Required fields are missing",
        details: { missing }
      });
    }

    next();
  };
}


