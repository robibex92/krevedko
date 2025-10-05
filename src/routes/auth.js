import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  publicUser,
  requireAuth,
  randomToken,
  sha256Hex,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  resolveUserId,
} from "../middleware/auth.js";
import { sendVerificationEmail } from "../services/mailer.js";
import { verifyTelegramLogin } from "../services/telegram.js";
import { clearCache } from "../services/cache.js";

const router = Router();

router.post("/register", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { email, password, name, phone, firstName, lastName } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "EMAIL_PASSWORD_REQUIRED" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    const passwordHash = await bcrypt.hash(password, 10);
    const normalizedFirstName = firstName ? String(firstName).trim() : null;
    const normalizedLastName = lastName ? String(lastName).trim() : null;
    const fallbackName = name?.trim() || [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ") || null;

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: fallbackName,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        phone: phone || null,
        referredBy: req.session.referrerId || null,
      },
    });

    if (normalizedEmail) {
      const token = randomToken(32);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationTokenHash: sha256Hex(token),
          emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      try { await sendVerificationEmail(normalizedEmail, token); } catch (e) { console.error("[mail] send failed", e); }
    }

    if (req.session.referrerId) {
      delete req.session.referrerId;
      delete req.session.referralCode;
    }

    req.session.user = publicUser(user);
    // Issue JWTs right after registration
    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti, exp } = signRefreshToken(user);
    // Persist refresh token
    try {
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti,
          expiresAt: exp ? new Date(exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdByIp: req.ip || null,
        },
      });
    } catch (e) {
      console.error("[auth] failed to persist refresh token on register", e);
    }
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user: publicUser(user), accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "REGISTER_FAILED" });
  }
});

router.post("/login", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "EMAIL_PASSWORD_REQUIRED" });
    const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
    if (!user?.passwordHash) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    // Session for backward-compatibility
    req.session.user = publicUser(user);
    // JWT tokens
    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti, exp } = signRefreshToken(user);
    try {
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti,
          expiresAt: exp ? new Date(exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdByIp: req.ip || null,
        },
      });
    } catch (e) {
      console.error("[auth] failed to persist refresh token on login", e);
    }
    setRefreshCookie(res, refreshToken);
    res.json({ user: publicUser(user), accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "LOGIN_FAILED" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        const prisma = req.app.locals.prisma;
        await prisma.refreshToken.updateMany({
          where: { jti: payload.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } catch {}
    }
  } finally {
    clearRefreshCookie(res);
    if (!req.session) return res.json({ ok: true });
    req.session.destroy(() => {
      res.clearCookie("sid");
      res.json({ ok: true });
    });
  }
});

router.get("/me", async (req, res) => {
  // Disable caching to avoid 304 responses breaking fetch handling on the frontend
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  if (req.session?.user) return res.json({ user: req.session.user });
  try {
    const authz = req.headers["authorization"] || req.headers["Authorization"];
    if (!authz || !authz.toString().startsWith("Bearer ")) return res.json({ user: null });
    const token = authz.toString().slice(7);
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me");
    const userId = resolveUserId(payload?.sub);
    if (userId === null) return res.json({ user: null });
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.json({ user: null });
    req.session = req.session || {};
    req.session.user = publicUser(user);
    return res.json({ user: publicUser(user) });
  } catch {
    return res.json({ user: null });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: "NO_REFRESH" });
    const payload = verifyRefreshToken(token);
    const prisma = req.app.locals.prisma;
    const userId = resolveUserId(payload?.sub);
    if (userId === null) return res.status(401).json({ error: "INVALID_REFRESH" });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "INVALID_REFRESH" });

    // DB validation of refresh token state
    const dbToken = await prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!dbToken || dbToken.revokedAt || dbToken.expiresAt < new Date()) {
      return res.status(401).json({ error: "REFRESH_REVOKED_OR_EXPIRED" });
    }

    // Decide whether to rotate refresh token
    const now = Date.now();
    const remainingMs = dbToken.expiresAt.getTime() - now;
    const ROTATE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    let accessToken;
    if (remainingMs > ROTATE_THRESHOLD_MS) {
      // Keep existing refresh token, only issue a new access token
      accessToken = signAccessToken(user);
      req.session = req.session || {};
      req.session.user = publicUser(user);
      return res.json({ accessToken, user: publicUser(user) });
    }

    // Rotate refresh (close to expiry)
    const { token: newToken, jti: newJti, exp } = signRefreshToken(user);
    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { jti: payload.jti },
        data: { revokedAt: new Date(), replacedByJti: newJti },
      }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti: newJti,
          expiresAt: exp ? new Date(exp * 1000) : new Date(now + 30 * 24 * 60 * 60 * 1000),
          createdByIp: req.ip || null,
        },
      }),
    ]);
    setRefreshCookie(res, newToken);
    accessToken = signAccessToken(user);
    req.session = req.session || {};
    req.session.user = publicUser(user);
    res.json({ accessToken, user: publicUser(user) });
  } catch (e) {
    return res.status(401).json({ error: "REFRESH_FAILED" });
  }
});

router.get("/verify", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const token = String(req.query.token || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!token || !email) return res.status(400).json({ error: "INVALID_PARAMS" });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerificationTokenHash || !user.emailVerificationExpiresAt)
      return res.status(400).json({ error: "INVALID_TOKEN" });
    if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    if (user.emailVerificationExpiresAt < new Date()) return res.status(400).json({ error: "TOKEN_EXPIRED" });
    if (user.emailVerificationTokenHash !== sha256Hex(token)) return res.status(400).json({ error: "INVALID_TOKEN" });

    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "EMAIL_VERIFY_FAILED" });
  }
});

router.post("/verify/resend", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const me = await prisma.user.findUnique({ where: { id: req.session.user.id } });
    if (!me?.email) return res.status(400).json({ error: "NO_EMAIL" });
    if (me.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    const token = randomToken(32);
    await prisma.user.update({ where: { id: me.id }, data: { emailVerificationTokenHash: sha256Hex(token), emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    try { await sendVerificationEmail(me.email, token); } catch (e) { console.error(e); }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "EMAIL_VERIFY_RESEND_FAILED" });
  }
});

router.post("/email", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { email } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ error: "EMAIL_REQUIRED" });
    const taken = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (taken && taken.id !== req.session.user.id) return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    await prisma.user.update({ where: { id: req.session.user.id }, data: { email: normalizedEmail, emailVerifiedAt: null } });
    const token = randomToken(32);
    await prisma.user.update({ where: { id: req.session.user.id }, data: { emailVerificationTokenHash: sha256Hex(token), emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    try { await sendVerificationEmail(normalizedEmail, token); } catch (e) { console.error(e); }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "EMAIL_CHANGE_FAILED" });
  }
});

router.post("/telegram/verify", async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = process.env;
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOT_USERNAME) {
      return res.status(501).json({ error: "TELEGRAM_NOT_CONFIGURED" });
    }
    const authData = req.body || {};
    const valid = verifyTelegramLogin(authData, TELEGRAM_BOT_TOKEN);
    if (!valid) return res.status(401).json({ error: "INVALID_TELEGRAM_SIGNATURE" });
    const telegramId = String(authData.id);
    const name = [authData.first_name, authData.last_name].filter(Boolean).join(" ").trim() || null;
    const telegramUsername = authData.username || null;
    const telegramPhotoUrl = authData.photo_url || null;
    const firstName = authData.first_name || null;
    const lastName = authData.last_name || null;

    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({ data: { name, firstName, lastName, telegramId, telegramUsername, telegramPhotoUrl } });
    } else {
      user = await prisma.user.update({ where: { id: user.id }, data: { name, firstName, lastName, telegramUsername, telegramPhotoUrl } });
    }
    req.session.user = publicUser(user);
    // Issue JWTs for Telegram login as well
    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti, exp } = signRefreshToken(user);
    try {
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti,
          expiresAt: exp ? new Date(exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdByIp: req.ip || null,
        },
      });
    } catch (e) {
      console.error("[auth] failed to persist refresh token on telegram verify", e);
    }
    setRefreshCookie(res, refreshToken);
    res.json({ user: publicUser(user), accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "TELEGRAM_VERIFY_FAILED" });
  }
});

router.post("/telegram/link", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = process.env;
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOT_USERNAME) {
      return res.status(501).json({ error: "TELEGRAM_NOT_CONFIGURED" });
    }
    const authData = req.body || {};
    const valid = verifyTelegramLogin(authData, TELEGRAM_BOT_TOKEN);
    if (!valid) return res.status(401).json({ error: "INVALID_TELEGRAM_SIGNATURE" });

    const telegramId = String(authData.id);
    const name = [authData.first_name, authData.last_name].filter(Boolean).join(" ").trim() || null;
    const telegramUsername = authData.username || null;
    const telegramPhotoUrl = authData.photo_url || null;
    const firstName = authData.first_name || null;
    const lastName = authData.last_name || null;

    const meId = req.session.user.id;
    const existing = await prisma.user.findUnique({ where: { telegramId } });

    // If another user already has this telegramId, merge that user into current user
    if (existing && existing.id !== meId) {
      const otherId = existing.id;
      const merged = await prisma.$transaction(async (tx) => {
        // 1) Move orders
        await tx.order.updateMany({ where: { userId: otherId }, data: { userId: meId } });

        // 2) Move cart items with upsert to avoid unique conflicts
        const otherCart = await tx.cartItem.findMany({ where: { userId: otherId } });
        for (const it of otherCart) {
          await tx.cartItem.upsert({
            where: { userId_collectionId_productId: { userId: meId, collectionId: it.collectionId, productId: it.productId } },
            update: { quantityDecimal: it.quantityDecimal.toString(), unitPriceKopecks: it.unitPriceKopecks },
            create: { userId: meId, collectionId: it.collectionId, productId: it.productId, quantityDecimal: it.quantityDecimal.toString(), unitPriceKopecks: it.unitPriceKopecks },
          });
        }
        await tx.cartItem.deleteMany({ where: { userId: otherId } });

        // 3) Move favorites with upsert to avoid duplicates
        const otherFavs = await tx.favorite.findMany({ where: { userId: otherId } });
        for (const f of otherFavs) {
          await tx.favorite.upsert({
            where: { userId_productId: { userId: meId, productId: f.productId } },
            update: {},
            create: { userId: meId, productId: f.productId },
          });
        }
        await tx.favorite.deleteMany({ where: { userId: otherId } });

        // 4) Reassign referrals (children of other -> me)
        await tx.user.updateMany({ where: { referredBy: otherId }, data: { referredBy: meId } });

        // 5) Merge loyalty points
        const me = await tx.user.findUnique({ where: { id: meId }, select: { loyaltyPoints: true } });
        const other = await tx.user.findUnique({ where: { id: otherId }, select: { loyaltyPoints: true } });
        const mergedPoints = (me?.loyaltyPoints || 0) + (other?.loyaltyPoints || 0);

        // 6) Update current user with telegram info and merged fields
        const updateData = { telegramId, telegramUsername, telegramPhotoUrl, loyaltyPoints: mergedPoints };
        if (!req.session.user.name && name) updateData.name = name;
        if (!req.session.user.firstName && firstName) updateData.firstName = firstName;
        if (!req.session.user.lastName && lastName) updateData.lastName = lastName;

        const updatedMe = await tx.user.update({ where: { id: meId }, data: updateData });

        // 7) Revoke/delete refresh tokens of the merged (other) user and delete other account
        await tx.refreshToken.updateMany({ where: { userId: otherId, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.user.delete({ where: { id: otherId } });

        return updatedMe;
      });

      req.session.user = publicUser(merged);
      try {
        clearCache(`favorites:${meId}`);
        clearCache(`favorites:${otherId}`);
      } catch {}
      return res.json({ user: publicUser(merged), merged: true });
    }

    // Normal path: link telegram to current account
    const updateData = { telegramId, telegramUsername, telegramPhotoUrl };
    if (!req.session.user.name && name) updateData.name = name;
    if (!req.session.user.firstName && firstName) updateData.firstName = firstName;
    if (!req.session.user.lastName && lastName) updateData.lastName = lastName;

    const user = await prisma.user.update({ where: { id: meId }, data: updateData });
    req.session.user = publicUser(user);
    try { clearCache(`favorites:${meId}`); } catch {}
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "TELEGRAM_LINK_FAILED" });
  }
});

router.post("/telegram/unlink", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const me = await prisma.user.findUnique({ where: { id: req.session.user.id } });
    if (!me) return res.status(404).json({ error: "USER_NOT_FOUND" });

    // Safety: prevent lockout. Allow unlink only if user can login by other means
    const hasPassword = Boolean(me.passwordHash);
    const hasVerifiedEmail = Boolean(me.email && me.emailVerifiedAt);
    if (!hasPassword && !hasVerifiedEmail) {
      return res.status(400).json({ error: "CANNOT_UNLINK_ONLY_AUTH_METHOD" });
    }

    const updated = await prisma.user.update({
      where: { id: me.id },
      data: { telegramId: null, telegramUsername: null, telegramPhotoUrl: null },
    });
    req.session.user = publicUser(updated);
    try { clearCache(`favorites:${me.id}`); } catch {}
    res.json({ user: publicUser(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "TELEGRAM_UNLINK_FAILED" });
  }
});

export default router;
