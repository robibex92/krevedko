import crypto from "crypto";
import jwt from "jsonwebtoken";

const {
  JWT_ACCESS_SECRET = "dev_access_secret_change_me",
  JWT_REFRESH_SECRET = "dev_refresh_secret_change_me",
  JWT_ACCESS_TTL = "15m",
  JWT_REFRESH_TTL = "30d",
  NODE_ENV = "development",
} = process.env;

export async function requireAuth(req, res, next) {
  // 1) Session-based auth (backward compatibility)
  if (req.session?.user) return next();

  // 2) Bearer token (JWT) in Authorization header
  try {
    const authz = req.headers["authorization"] || req.headers["Authorization"];
    if (!authz || !authz.toString().startsWith("Bearer ")) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    const token = authz.toString().slice(7);
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const prisma = req.app?.locals?.prisma;
    if (!prisma) return res.status(500).json({ error: "PRISMA_NOT_AVAILABLE" });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
    // To not refactor routes, populate session-like shape
    req.session = req.session || {};
    req.session.user = publicUser(user);
    return next();
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.session?.user?.role === "ADMIN") return next();
  return res.status(403).json({ error: "FORBIDDEN" });
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? null,
    name: u.name ?? null,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    phone: u.phone ?? null,
    role: u.role,
    telegramId: u.telegramId ?? null,
    telegramUsername: u.telegramUsername ?? null,
    telegramPhotoUrl: u.telegramPhotoUrl ?? null,
    avatarPath: u.avatarPath ?? null,
    addressStreet: u.addressStreet ?? null,
    addressHouse: u.addressHouse ?? null,
    addressApartment: u.addressApartment ?? null,
  };
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// JWT helpers
export function signAccessToken(user) {
  const payload = { sub: user.id, role: user.role };
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_TTL });
}

export function signRefreshToken(user) {
  const jti = randomToken(16);
  const payload = { sub: user.id, type: "refresh", jti };
  const token = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_TTL });
  const decoded = jwt.decode(token);
  const exp = decoded?.exp || null; // seconds since epoch
  return { token, jti, exp };
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

export function setRefreshCookie(res, token) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    sameSite: NODE_ENV === "production" ? "none" : "lax",
    secure: NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30d
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie("refresh_token", { path: "/api/auth" });
}
