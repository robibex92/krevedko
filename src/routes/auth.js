import { Router } from "express";
import bcrypt from "bcrypt";
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
} from "../middleware/auth.js";
import { sendVerificationEmail } from "../services/mailer.js";
import { verifyTelegramLogin } from "../services/telegram.js";

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
    const refreshToken = signRefreshToken(user);
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
    const refreshToken = signRefreshToken(user);
    setRefreshCookie(res, refreshToken);
    res.json({ user: publicUser(user), accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "LOGIN_FAILED" });
  }
});

router.post("/logout", (req, res) => {
  clearRefreshCookie(res);
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

router.get("/me", async (req, res) => {
  if (req.session?.user) return res.json({ user: req.session.user });
  try {
    const authz = req.headers["authorization"] || req.headers["Authorization"];
    if (!authz || !authz.toString().startsWith("Bearer ")) return res.json({ user: null });
    const token = authz.toString().slice(7);
    const { sub } = await import("jsonwebtoken").then(m => m.verify(token, process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me"));
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { id: sub } });
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
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "INVALID_REFRESH" });
    // rotate refresh
    const newRefresh = signRefreshToken(user);
    setRefreshCookie(res, newRefresh);
    const accessToken = signAccessToken(user);
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
    const refreshToken = signRefreshToken(user);
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

    const existing = await prisma.user.findUnique({ where: { telegramId } });
    if (existing && existing.id !== req.session.user.id) {
      return res.status(409).json({ error: "TELEGRAM_ID_ALREADY_LINKED" });
    }

    const updateData = { telegramId, telegramUsername, telegramPhotoUrl };
    if (!req.session.user.name && name) updateData.name = name;
    if (!req.session.user.firstName && firstName) updateData.firstName = firstName;
    if (!req.session.user.lastName && lastName) updateData.lastName = lastName;

    const user = await prisma.user.update({ where: { id: req.session.user.id }, data: updateData });
    req.session.user = publicUser(user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "TELEGRAM_LINK_FAILED" });
  }
});

export default router;
