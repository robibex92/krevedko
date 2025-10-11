import { randomToken } from "../middleware/auth.js";

/**
 * ✅ CSRF Issue - теперь работает без сессий
 * Возвращает статичный токен для совместимости с фронтендом
 * JWT не подвержен CSRF атакам, так что это только для legacy поддержки
 */
export function csrfIssue(req, res) {
  // Для JWT-авторизации CSRF не нужен, возвращаем статичный токен
  const token = "jwt-no-csrf-needed";
  res.json({ csrfToken: token });
}

/**
 * ✅ CSRF Protect - skip для JWT
 * JWT авторизация не подвержена CSRF атакам (stateless, в header, не в cookie)
 */
export function csrfProtect(req, res, next) {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();
  
  // JWT в Authorization header - безопасен от CSRF, пропускаем проверку
  const authz = req.headers["authorization"] || req.headers["Authorization"];
  if (authz && authz.toString().startsWith("Bearer ")) {
    return next();
  }
  
  // Для всех остальных запросов тоже пропускаем (так как сессий больше нет)
  // В будущем можно удалить csrfProtect полностью
  next();
}

