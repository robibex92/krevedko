/**
 * Security Logger Middleware
 * Логирование подозрительной активности и потенциальных атак
 */

import fs from "fs/promises";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const SECURITY_LOG_FILE = path.join(LOG_DIR, "security.log");

/**
 * Инициализация директории логов
 */
async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error("[security-logger] Failed to create log directory:", error);
  }
}

// Инициализируем при импорте
ensureLogDir();

/**
 * Записать событие безопасности в лог
 */
async function logSecurityEvent(event) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...event
  };

  const logLine = JSON.stringify(logEntry) + "\n";

  try {
    await fs.appendFile(SECURITY_LOG_FILE, logLine, "utf8");
  } catch (error) {
    console.error("[security-logger] Failed to write security log:", error);
  }

  // Также выводим в консоль для важных событий
  if (["HIGH", "CRITICAL"].includes(event.severity)) {
    console.warn(`[SECURITY ${event.severity}]`, event);
  }
}

/**
 * Определяет подозрительные паттерны в запросе
 */
function detectSuspiciousPatterns(req) {
  const suspicious = [];

  // Проверка URL на SQL injection паттерны
  const url = req.originalUrl || req.url;
  if (/(\bunion\b|\bselect\b|\binsert\b|\bdelete\b|\bdrop\b)/i.test(url)) {
    suspicious.push({
      type: "SQL_INJECTION_ATTEMPT",
      location: "URL",
      value: url
    });
  }

  // Проверка на попытки path traversal
  if (/\.\.[\/\\]/.test(url)) {
    suspicious.push({
      type: "PATH_TRAVERSAL_ATTEMPT",
      location: "URL",
      value: url
    });
  }

  // Проверка заголовков на подозрительные значения
  const userAgent = req.headers["user-agent"];
  if (!userAgent || userAgent.length < 10) {
    suspicious.push({
      type: "SUSPICIOUS_USER_AGENT",
      location: "Headers",
      value: userAgent || "empty"
    });
  }

  // Проверка на XSS в query параметрах
  const queryStr = JSON.stringify(req.query);
  if (/<script|javascript:|onerror|onload/i.test(queryStr)) {
    suspicious.push({
      type: "XSS_ATTEMPT",
      location: "Query",
      value: queryStr
    });
  }

  // Проверка на command injection паттерны
  const bodyStr = JSON.stringify(req.body);
  if (/[\|;&$`]/.test(bodyStr)) {
    suspicious.push({
      type: "COMMAND_INJECTION_ATTEMPT",
      location: "Body",
      value: bodyStr.substring(0, 200)
    });
  }

  return suspicious;
}

/**
 * Middleware для логирования событий безопасности
 */
export function securityLogger(req, res, next) {
  const startTime = Date.now();

  // Определяем IP
  const ip = req.ip || 
             req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
             req.headers["x-real-ip"] ||
             req.connection?.remoteAddress ||
             "unknown";

  // Определяем пользователя
  const userId = req.user?.id || null;

  // Проверяем на подозрительные паттерны
  const suspicious = detectSuspiciousPatterns(req);

  // Если обнаружены подозрительные паттерны, логируем немедленно
  if (suspicious.length > 0) {
    logSecurityEvent({
      severity: "HIGH",
      type: "SUSPICIOUS_REQUEST",
      ip,
      userId,
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.headers["user-agent"],
      patterns: suspicious
    });
  }

  // Перехватываем ответ для логирования ошибок
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    const duration = Date.now() - startTime;

    // Логируем ошибки аутентификации/авторизации
    if (res.statusCode === 401) {
      logSecurityEvent({
        severity: "MEDIUM",
        type: "AUTHENTICATION_FAILURE",
        ip,
        userId,
        method: req.method,
        url: req.originalUrl || req.url,
        duration
      });
    }

    if (res.statusCode === 403) {
      logSecurityEvent({
        severity: "MEDIUM",
        type: "AUTHORIZATION_FAILURE",
        ip,
        userId,
        method: req.method,
        url: req.originalUrl || req.url,
        duration
      });
    }

    // Логируем rate limit превышения
    if (res.statusCode === 429) {
      logSecurityEvent({
        severity: "MEDIUM",
        type: "RATE_LIMIT_EXCEEDED",
        ip,
        userId,
        method: req.method,
        url: req.originalUrl || req.url,
        duration
      });
    }

    // Логируем попытки использования чужих idempotency keys
    if (body?.error === "IDEMPOTENCY_KEY_MISMATCH") {
      logSecurityEvent({
        severity: "HIGH",
        type: "IDEMPOTENCY_KEY_MISMATCH",
        ip,
        userId,
        method: req.method,
        url: req.originalUrl || req.url,
        duration
      });
    }

    return originalJson(body);
  };

  next();
}

/**
 * Логирование успешных событий безопасности
 */
export const securityEvents = {
  /**
   * Успешная аутентификация
   */
  loginSuccess: (userId, ip, method = "password") => {
    logSecurityEvent({
      severity: "LOW",
      type: "LOGIN_SUCCESS",
      userId,
      ip,
      method
    });
  },

  /**
   * Неудачная попытка входа
   */
  loginFailure: (email, ip, reason = "invalid_credentials") => {
    logSecurityEvent({
      severity: "MEDIUM",
      type: "LOGIN_FAILURE",
      email,
      ip,
      reason
    });
  },

  /**
   * Смена пароля
   */
  passwordChange: (userId, ip) => {
    logSecurityEvent({
      severity: "MEDIUM",
      type: "PASSWORD_CHANGE",
      userId,
      ip
    });
  },

  /**
   * Создание заказа (для отслеживания fraud)
   */
  orderCreated: (orderId, userId, totalKopecks, ip) => {
    logSecurityEvent({
      severity: "LOW",
      type: "ORDER_CREATED",
      orderId,
      userId,
      totalKopecks,
      ip
    });
  },

  /**
   * Попытка доступа к чужому заказу
   */
  unauthorizedOrderAccess: (orderId, attemptedBy, ip) => {
    logSecurityEvent({
      severity: "HIGH",
      type: "UNAUTHORIZED_ORDER_ACCESS",
      orderId,
      attemptedBy,
      ip
    });
  },

  /**
   * Создание админа (критическое событие)
   */
  adminCreated: (newAdminId, createdBy, ip) => {
    logSecurityEvent({
      severity: "CRITICAL",
      type: "ADMIN_CREATED",
      newAdminId,
      createdBy,
      ip
    });
  }
};

/**
 * Получить последние события безопасности
 */
export async function getSecurityLogs(limit = 100) {
  try {
    const content = await fs.readFile(SECURITY_LOG_FILE, "utf8");
    const lines = content.trim().split("\n");
    
    // Берем последние N строк
    const recentLines = lines.slice(-limit);
    
    return recentLines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") {
      return []; // Файл не существует
    }
    console.error("[security-logger] Failed to read security logs:", error);
    return [];
  }
}

/**
 * Анализ логов безопасности для выявления аномалий
 */
export async function analyzeSecurityLogs() {
  const logs = await getSecurityLogs(1000);
  
  const analysis = {
    totalEvents: logs.length,
    bySeverity: {},
    byType: {},
    suspiciousIPs: {},
    failedLogins: {},
    recentHighSeverity: []
  };

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const log of logs) {
    // Подсчет по severity
    analysis.bySeverity[log.severity] = (analysis.bySeverity[log.severity] || 0) + 1;

    // Подсчет по типу
    analysis.byType[log.type] = (analysis.byType[log.type] || 0) + 1;

    // Отслеживание подозрительных IP
    if (["HIGH", "CRITICAL"].includes(log.severity)) {
      const ip = log.ip || "unknown";
      analysis.suspiciousIPs[ip] = (analysis.suspiciousIPs[ip] || 0) + 1;
    }

    // Отслеживание неудачных попыток входа
    if (log.type === "LOGIN_FAILURE") {
      const email = log.email || "unknown";
      analysis.failedLogins[email] = (analysis.failedLogins[email] || 0) + 1;
    }

    // Последние события высокой важности (за последний час)
    if (["HIGH", "CRITICAL"].includes(log.severity)) {
      const eventTime = new Date(log.timestamp).getTime();
      if (now - eventTime < oneHour) {
        analysis.recentHighSeverity.push(log);
      }
    }
  }

  return analysis;
}


