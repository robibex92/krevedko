import crypto from "crypto";

export function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: "UNAUTHORIZED" });
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
