import { randomToken } from "../middleware/auth.js";

export function csrfIssue(req, res) {
  const sid = req.sessionID;
  if (!sid) return res.status(500).json({ error: "NO_SESSION" });
  const secret = randomToken(32);
  req.app.locals.csrfSecrets.set(sid, secret);
  res.json({ csrfToken: secret });
}
export function csrfProtect(req, res, next) {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();
  // If request carries a Bearer JWT, skip CSRF checks (stateless auth is not CSRF-prone)
  const authz = req.headers["authorization"] || req.headers["Authorization"];
  if (authz && authz.toString().startsWith("Bearer ")) {
    return next();
  }
  const sid = req.sessionID;
  if (!sid) return res.status(401).json({ error: "UNAUTHORIZED" });
  const expected = req.app.locals.csrfSecrets.get(sid);
  const provided = req.headers["x-csrf-token"];
  if (!expected || !provided || provided !== expected) {
    return res.status(403).json({ error: "CSRF_INVALID" });
  }
  next();
}

