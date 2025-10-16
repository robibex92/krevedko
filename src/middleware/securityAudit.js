import { securityLogger } from "./securityLogger.js";

/**
 * Middleware для аудита безопасности
 * Логирует все попытки доступа к админским функциям
 */
export function securityAuditMiddleware(req, res, next) {
  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  // Перехватываем ответ для логирования
  res.send = function(body) {
    logSecurityEvent(req, res, startTime, body);
    return originalSend.call(this, body);
  };

  res.json = function(body) {
    logSecurityEvent(req, res, startTime, body);
    return originalJson.call(this, body);
  };

  next();
}

function logSecurityEvent(req, res, startTime, responseBody) {
  const duration = Date.now() - startTime;
  const isAdminRoute = req.path.startsWith('/api/admin');
  const isAuthRoute = req.path.startsWith('/api/auth');
  const userAgent = req.get('User-Agent') || 'Unknown';
  const referer = req.get('Referer') || 'Direct';
  
  // Логируем все админские запросы
  if (isAdminRoute) {
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      userAgent,
      referer,
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
      statusCode: res.statusCode,
      duration,
      success: res.statusCode < 400,
    };

    // Дополнительное логирование для подозрительной активности
    if (res.statusCode === 401 || res.statusCode === 403) {
      logData.securityEvent = 'UNAUTHORIZED_ACCESS_ATTEMPT';
      logData.severity = 'HIGH';
    } else if (res.statusCode >= 400) {
      logData.securityEvent = 'ADMIN_ACCESS_ERROR';
      logData.severity = 'MEDIUM';
    } else {
      logData.securityEvent = 'ADMIN_ACCESS_SUCCESS';
      logData.severity = 'LOW';
    }

    securityLogger.log('SECURITY_AUDIT', logData);
  }

  // Логируем попытки аутентификации
  if (isAuthRoute && (req.method === 'POST' || req.method === 'PATCH')) {
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      userAgent,
      referer,
      statusCode: res.statusCode,
      duration,
      success: res.statusCode < 400,
    };

    if (res.statusCode === 401) {
      logData.securityEvent = 'FAILED_AUTHENTICATION';
      logData.severity = 'MEDIUM';
    } else if (res.statusCode === 200 || res.statusCode === 201) {
      logData.securityEvent = 'SUCCESSFUL_AUTHENTICATION';
      logData.severity = 'LOW';
    }

    securityLogger.log('AUTH_AUDIT', logData);
  }
}

/**
 * Middleware для проверки подозрительной активности
 */
export function suspiciousActivityMiddleware(req, res, next) {
  const userAgent = req.get('User-Agent') || '';
  const ip = req.ip || req.connection.remoteAddress;
  
  // Проверяем подозрительные User-Agent
  const suspiciousUserAgents = [
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'zap',
    'burp',
    'w3af',
    'nessus',
    'openvas',
    'metasploit',
  ];

  const isSuspiciousUA = suspiciousUserAgents.some(ua => 
    userAgent.toLowerCase().includes(ua.toLowerCase())
  );

  if (isSuspiciousUA) {
    securityLogger.log('SUSPICIOUS_ACTIVITY', {
      timestamp: new Date().toISOString(),
      type: 'SUSPICIOUS_USER_AGENT',
      ip,
      userAgent,
      path: req.path,
      method: req.method,
      severity: 'HIGH',
    });

    // Блокируем запрос
    return res.status(403).json({ 
      error: 'FORBIDDEN',
      message: 'Suspicious activity detected'
    });
  }

  next();
}

/**
 * Middleware для ограничения доступа по IP (опционально)
 */
export function ipWhitelistMiddleware(allowedIPs = []) {
  return (req, res, next) => {
    // Если whitelist не настроен, пропускаем
    if (allowedIPs.length === 0) {
      return next();
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    const isAllowed = allowedIPs.some(ip => 
      clientIP === ip || clientIP.startsWith(ip)
    );

    if (!isAllowed) {
      securityLogger.log('IP_WHITELIST_VIOLATION', {
        timestamp: new Date().toISOString(),
        ip: clientIP,
        path: req.path,
        method: req.method,
        severity: 'HIGH',
      });

      return res.status(403).json({ 
        error: 'FORBIDDEN',
        message: 'IP not allowed'
      });
    }

    next();
  };
}
