import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { bbcodeToHtml, bbcodeToText } from "../utils/bbcode.js";
import { notificationUpload } from "../services/uploads.js";

const router = Router();

const CYRILLIC_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const NOTIFICATION_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
const NOTIFICATION_AUDIENCE = new Set(["ALL", "CUSTOM"]);

function slugifyNotificationSlug(input) {
  if (!input) return "notification";
  const lower = String(input).toLowerCase();
  let result = "";
  for (const char of lower) {
    if (/[a-z0-9]/.test(char)) {
      result += char;
      continue;
    }
    if (CYRILLIC_MAP[char]) {
      result += CYRILLIC_MAP[char];
      continue;
    }
    if (/\d/.test(char)) {
      result += char;
      continue;
    }
    result += "-";
  }
  result = result.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!result) return "notification";
  return result.slice(0, 96);
}

async function ensureNotificationSlug(prisma, desiredSlug, excludeId = null) {
  const base = slugifyNotificationSlug(desiredSlug);
  let candidate = base;
  let counter = 1;
  while (true) {
    const existing = await prisma.notification.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
    counter += 1;
    candidate = `${base}-${counter}`;
  }
}

function sanitizeImagePath(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const clean = raw.replace(/^\/+/, "").replace(/^uploads\//, "");
  if (clean.includes("..")) throw new Error("INVALID_IMAGE_PATH");
  return clean;
}

function sanitizeExternalLink(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith("mailto:")) {
    throw new Error("INVALID_LINK_URL");
  }
  return raw;
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  const str = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(str)) return true;
  if (["0", "false", "no", "off"].includes(str)) return false;
  return fallback;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAudienceFilter(input) {
  if (!input) return null;
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (err) {
      throw new Error("INVALID_AUDIENCE_FILTER_JSON");
    }
  }
  if (!data || typeof data !== "object") return null;
  const filter = {};
  if (Array.isArray(data.roles)) {
    const roles = data.roles
      .map((role) => (typeof role === "string" ? role.trim().toUpperCase() : null))
      .filter(Boolean);
    if (roles.length) filter.roles = roles;
  }
  if (data.minCreatedAt) {
    const date = parseDate(data.minCreatedAt);
    if (!date) throw new Error("INVALID_AUDIENCE_FILTER_MIN_CREATED");
    filter.minCreatedAt = date.toISOString();
  }
  if (data.maxCreatedAt) {
    const date = parseDate(data.maxCreatedAt);
    if (!date) throw new Error("INVALID_AUDIENCE_FILTER_MAX_CREATED");
    filter.maxCreatedAt = date.toISOString();
  }
  if (data.minOrders !== undefined) {
    const minOrders = Number(data.minOrders);
    if (!Number.isFinite(minOrders) || minOrders < 0) {
      throw new Error("INVALID_AUDIENCE_FILTER_MIN_ORDERS");
    }
    filter.minOrders = minOrders;
  }
  return Object.keys(filter).length ? filter : null;
}

function isNowWithinSchedule(notification, now = new Date()) {
  if (!notification.isActive) return false;
  if (notification.startsAt && notification.startsAt > now) return false;
  if (notification.endsAt && notification.endsAt < now) return false;
  return true;
}

function matchesAudience(notification, user) {
  if (notification.audience !== "CUSTOM") return true;
  const filter = notification.audienceFilter || {};
  if (filter.roles && Array.isArray(filter.roles) && filter.roles.length) {
    if (!filter.roles.includes(user.role)) return false;
  }
  if (filter.minCreatedAt && new Date(filter.minCreatedAt) > user.createdAt) {
    return false;
  }
  if (filter.maxCreatedAt && new Date(filter.maxCreatedAt) < user.createdAt) {
    return false;
  }
  if (filter.minOrders) {
    if ((user._count?.orders || 0) < Number(filter.minOrders)) return false;
  }
  return true;
}

function normalizeNotificationPayload(notification) {
  const base = {
    id: notification.id,
    slug: notification.slug,
    title: notification.title,
    excerpt: notification.excerpt,
    bodyHtml: notification.bodyHtml,
    imagePath: notification.imagePath,
    imageUrl: notification.imagePath ? `/uploads/${notification.imagePath}` : null,
    linkUrl: notification.linkUrl,
    priority: notification.priority,
    audience: notification.audience,
    audienceFilter: notification.audienceFilter,
    showOnce: notification.showOnce,
    isActive: notification.isActive,
    startsAt: notification.startsAt,
    endsAt: notification.endsAt,
    createdAt: notification.createdAt,
    publishedAt: notification.publishedAt,
  };
  return base;
}

async function fetchUnreadNotifications(prisma, userId) {
  const [rawUser, notifications] = await Promise.all([
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, createdAt: true, loyaltyPoints: true, _count: { select: { orders: true } } },
        })
      : null,
    (async () => {
      const query = {
        where: { isActive: true },
        orderBy: [{ priority: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      };
      if (userId) {
        query.include = { statuses: { where: { userId } } };
      }
      return prisma.notification.findMany(query);
    })(),
  ]);

  const now = new Date();
  const payload = [];
  for (const notification of notifications) {
    if (!isNowWithinSchedule(notification, now)) continue;
    if (notification.audience === "CUSTOM" && !rawUser) continue;
    if (rawUser && !matchesAudience(notification, rawUser)) continue;
    const statuses = Array.isArray(notification.statuses) ? notification.statuses : [];
    const status = statuses[0] || null;
    if (userId && status) {
      if (status.dontShowAgain) continue;
      if (notification.showOnce && (status.status === "READ" || status.status === "DISMISSED")) {
        continue;
      }
      if (status.status === "DISMISSED") continue;
    }
    payload.push({
      ...normalizeNotificationPayload(notification),
      status: status
        ? {
            status: status.status,
            readAt: status.readAt,
            dismissedAt: status.dismissedAt,
            dontShowAgain: status.dontShowAgain,
          }
        : null,
    });
  }
  return payload;
}

async function fetchHistoryNotifications(prisma, userId) {
  const statuses = await prisma.userNotificationStatus.findMany({
    where: { userId, status: { in: ["READ", "DISMISSED"] } },
    include: { notification: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
  });

  return statuses
    .filter((row) => row.notification)
    .map((row) => ({
      ...normalizeNotificationPayload(row.notification),
      status: {
        status: row.status,
        readAt: row.readAt,
        dismissedAt: row.dismissedAt,
        dontShowAgain: row.dontShowAgain,
      },
    }));
}

// ------------------------
// Public notification APIs
// ------------------------

router.get("/notifications/unread", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const userId = req.session.user.id;
  try {
    const payload = await fetchUnreadNotifications(prisma, userId);
    res.json({ notifications: payload });
  } catch (error) {
    console.error("[notifications] unread failed", error);
    res.status(500).json({ error: "NOTIFICATIONS_FETCH_FAILED" });
  }
});

router.get("/notifications/history", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const userId = req.session.user.id;
  try {
    const payload = await fetchHistoryNotifications(prisma, userId);
    res.json({ notifications: payload });
  } catch (error) {
    console.error("[notifications] history failed", error);
    res.status(500).json({ error: "NOTIFICATIONS_HISTORY_FAILED" });
  }
});

router.get("/notifications", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const userId = req.session.user.id;
  try {
    const [unread, history] = await Promise.all([
      fetchUnreadNotifications(prisma, userId),
      fetchHistoryNotifications(prisma, userId),
    ]);
    res.json({ unread, history });
  } catch (error) {
    console.error("[notifications] combined fetch failed", error);
    res.status(500).json({ error: "NOTIFICATIONS_COMBINED_FETCH_FAILED" });
  }
});

router.get("/notifications/public", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const unread = await fetchUnreadNotifications(prisma, null);
    res.json({ notifications: unread });
  } catch (error) {
    console.error("[notifications] public fetch failed", error);
    res.status(500).json({ error: "NOTIFICATIONS_PUBLIC_FETCH_FAILED" });
  }
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const userId = req.session.user.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
  try {
    const now = new Date();
    const record = await prisma.userNotificationStatus.upsert({
      where: { userId_notificationId: { userId, notificationId: id } },
      create: {
        userId,
        notificationId: id,
        status: "READ",
        readAt: now,
      },
      update: {
        status: "READ",
        readAt: now,
        dismissedAt: null,
        dontShowAgain: false,
      },
    });
    res.json({ status: {
      status: record.status,
      readAt: record.readAt,
      dismissedAt: record.dismissedAt,
      dontShowAgain: record.dontShowAgain,
    } });
  } catch (error) {
    console.error("[notifications] mark read failed", error);
    res.status(500).json({ error: "NOTIFICATION_MARK_READ_FAILED" });
  }
});

router.post("/notifications/:id/dismiss", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const userId = req.session.user.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
  const dontShowAgain = Boolean(req.body?.dontShowAgain);
  try {
    const now = new Date();
    const record = await prisma.userNotificationStatus.upsert({
      where: { userId_notificationId: { userId, notificationId: id } },
      create: {
        userId,
        notificationId: id,
        status: dontShowAgain ? "DISMISSED" : "READ",
        readAt: dontShowAgain ? now : null,
        dismissedAt: dontShowAgain ? now : null,
        dontShowAgain,
      },
      update: {
        status: dontShowAgain ? "DISMISSED" : "READ",
        readAt: dontShowAgain ? now : new Date(),
        dismissedAt: dontShowAgain ? now : null,
        dontShowAgain,
      },
    });
    res.json({ status: {
      status: record.status,
      readAt: record.readAt,
      dismissedAt: record.dismissedAt,
      dontShowAgain: record.dontShowAgain,
    } });
  } catch (error) {
    console.error("[notifications] dismiss failed", error);
    res.status(500).json({ error: "NOTIFICATION_DISMISS_FAILED" });
  }
});

// ------------------------
// Admin CRUD APIs
// ------------------------

router.get("/admin/notifications", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: [{ createdAt: "desc" }],
    });
    res.json({ notifications: notifications.map((n) => normalizeNotificationPayload(n)) });
  } catch (error) {
    console.error("[admin notifications] list failed", error);
    res.status(500).json({ error: "ADMIN_NOTIFICATIONS_LIST_FAILED" });
  }
});

router.get("/admin/notifications/:id", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
  try {
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) return res.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
    res.json({ notification: normalizeNotificationPayload(notification) });
  } catch (error) {
    console.error("[admin notifications] get failed", error);
    res.status(500).json({ error: "ADMIN_NOTIFICATION_FETCH_FAILED" });
  }
});

router.post("/admin/notifications", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const {
      title,
      slug,
      excerpt,
      bodyBbcode,
      imagePath,
      linkUrl,
      priority,
      audience,
      audienceFilter,
      isActive,
      showOnce,
      startsAt,
      endsAt,
      publishedAt,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: "TITLE_REQUIRED" });
    if (!bodyBbcode && bodyBbcode !== "") return res.status(400).json({ error: "BODY_REQUIRED" });

    const safePriority = NOTIFICATION_PRIORITIES.has(String(priority || "").toUpperCase())
      ? String(priority).toUpperCase()
      : "MEDIUM";
    const safeAudience = NOTIFICATION_AUDIENCE.has(String(audience || "").toUpperCase())
      ? String(audience).toUpperCase()
      : "ALL";

    const safeFilter = safeAudience === "CUSTOM" ? parseAudienceFilter(audienceFilter) : null;
    const safeSlug = await ensureNotificationSlug(prisma, slug || title);
    const safeImagePath = sanitizeImagePath(imagePath);
    const safeLink = sanitizeExternalLink(linkUrl);
    const safeStartsAt = parseDate(startsAt);
    const safeEndsAt = parseDate(endsAt);
    const safePublishedAt = parseDate(publishedAt);
    const safeIsActive = parseBooleanFlag(isActive, true);
    const safeShowOnce = parseBooleanFlag(showOnce, false);

    const html = bbcodeToHtml(bodyBbcode || "");
    const textExcerpt = excerpt && String(excerpt).trim()
      ? String(excerpt).trim()
      : bbcodeToText(bodyBbcode || "").slice(0, 280);

    const created = await prisma.notification.create({
      data: {
        slug: safeSlug,
        title: String(title).trim(),
        excerpt: textExcerpt || null,
        bodyBbcode: bodyBbcode || "",
        bodyHtml: html,
        imagePath: safeImagePath,
        linkUrl: safeLink,
        priority: safePriority,
        audience: safeAudience,
        audienceFilter: safeFilter,
        isActive: safeIsActive,
        showOnce: safeShowOnce,
        startsAt: safeStartsAt,
        endsAt: safeEndsAt,
        publishedAt: safePublishedAt || (safeIsActive ? new Date() : null),
      },
    });

    res.status(201).json({ notification: normalizeNotificationPayload(created) });
  } catch (error) {
    console.error("[admin notifications] create failed", error);
    const message = error?.message || "ADMIN_NOTIFICATION_CREATE_FAILED";
    res.status(500).json({ error: "ADMIN_NOTIFICATION_CREATE_FAILED", message });
  }
});

router.patch("/admin/notifications/:id", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
  try {
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });

    const {
      title,
      slug,
      excerpt,
      bodyBbcode,
      imagePath,
      linkUrl,
      priority,
      audience,
      audienceFilter,
      isActive,
      showOnce,
      startsAt,
      endsAt,
      publishedAt,
    } = req.body || {};

    const data = {};
    if (title !== undefined) data.title = String(title).trim();
    if (slug !== undefined) data.slug = await ensureNotificationSlug(prisma, slug || title || existing.title, id);
    if (excerpt !== undefined) {
      const trimmed = String(excerpt || "").trim();
      data.excerpt = trimmed || null;
    }
    if (bodyBbcode !== undefined) {
      const source = bodyBbcode || "";
      data.bodyBbcode = source;
      data.bodyHtml = bbcodeToHtml(source);
      if (excerpt === undefined) {
        const textExcerpt = bbcodeToText(source).slice(0, 280);
        data.excerpt = textExcerpt || existing.excerpt;
      }
    }
    if (imagePath !== undefined) data.imagePath = sanitizeImagePath(imagePath);
    if (linkUrl !== undefined) data.linkUrl = sanitizeExternalLink(linkUrl);
    if (priority !== undefined) {
      const safePriority = NOTIFICATION_PRIORITIES.has(String(priority || "").toUpperCase())
        ? String(priority).toUpperCase()
        : existing.priority;
      data.priority = safePriority;
    }
    if (audience !== undefined) {
      const safeAudience = NOTIFICATION_AUDIENCE.has(String(audience || "").toUpperCase())
        ? String(audience).toUpperCase()
        : existing.audience;
      data.audience = safeAudience;
      const filter = safeAudience === "CUSTOM" ? parseAudienceFilter(audienceFilter ?? existing.audienceFilter) : null;
      data.audienceFilter = filter;
    } else if (audienceFilter !== undefined && existing.audience === "CUSTOM") {
      data.audienceFilter = parseAudienceFilter(audienceFilter);
    }
    if (isActive !== undefined) data.isActive = parseBooleanFlag(isActive, existing.isActive);
    if (showOnce !== undefined) data.showOnce = parseBooleanFlag(showOnce, existing.showOnce);
    if (startsAt !== undefined) data.startsAt = parseDate(startsAt);
    if (endsAt !== undefined) data.endsAt = parseDate(endsAt);
    if (publishedAt !== undefined) data.publishedAt = parseDate(publishedAt);

    const updated = await prisma.notification.update({
      where: { id },
      data,
    });
    res.json({ notification: normalizeNotificationPayload(updated) });
  } catch (error) {
    console.error("[admin notifications] update failed", error);
    const message = error?.message || "ADMIN_NOTIFICATION_UPDATE_FAILED";
    res.status(500).json({ error: "ADMIN_NOTIFICATION_UPDATE_FAILED", message });
  }
});

router.delete("/admin/notifications/:id", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "INVALID_ID" });
  try {
    await prisma.userNotificationStatus.deleteMany({ where: { notificationId: id } });
    await prisma.notification.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error("[admin notifications] delete failed", error);
    res.status(500).json({ error: "ADMIN_NOTIFICATION_DELETE_FAILED" });
  }
});

router.post(
  "/admin/notifications/upload",
  requireAuth,
  requireAdmin,
  notificationUpload.single("image"),
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "NO_FILE" });
      const relPath = ["notifications", req.file.filename].join("/");
      res.json({
        file: {
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: relPath,
          url: `/uploads/${relPath}`,
        },
      });
    } catch (error) {
      console.error("[admin notifications] upload failed", error);
      res.status(500).json({ error: "ADMIN_NOTIFICATION_UPLOAD_FAILED" });
    }
  }
);

export default router;
