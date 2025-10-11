/**
 * Utility functions for notification slug generation and sanitization
 */

export const CYRILLIC_MAP = {
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

export const NOTIFICATION_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
export const NOTIFICATION_AUDIENCE = new Set(["ALL", "CUSTOM"]);

/**
 * Slugify notification title with Cyrillic transliteration
 */
export function slugifyNotificationSlug(input) {
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

/**
 * Sanitize image path
 */
export function sanitizeImagePath(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const clean = raw.replace(/^\/+/, "").replace(/^uploads\//, "");
  if (clean.includes("..")) throw new Error("INVALID_IMAGE_PATH");
  return clean;
}

/**
 * Sanitize external link
 */
export function sanitizeExternalLink(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith("mailto:")) {
    throw new Error("INVALID_LINK_URL");
  }
  return raw;
}

/**
 * Parse boolean flag
 */
export function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  const str = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(str)) return true;
  if (["0", "false", "no", "off"].includes(str)) return false;
  return fallback;
}

/**
 * Parse date
 */
export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse audience filter
 */
export function parseAudienceFilter(input) {
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
      .map((role) =>
        typeof role === "string" ? role.trim().toUpperCase() : null
      )
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

/**
 * Check if notification is within schedule
 */
export function isNowWithinSchedule(notification, now = new Date()) {
  if (!notification.isActive) return false;
  if (notification.startsAt && notification.startsAt > now) return false;
  if (notification.endsAt && notification.endsAt < now) return false;
  return true;
}

/**
 * Check if user matches notification audience
 */
export function matchesAudience(notification, user) {
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

/**
 * Normalize notification payload for API response
 */
export function normalizeNotificationPayload(notification) {
  return {
    id: notification.id,
    slug: notification.slug,
    title: notification.title,
    excerpt: notification.excerpt,
    bodyHtml: notification.bodyHtml,
    imagePath: notification.imagePath,
    imageUrl: notification.imagePath
      ? `/uploads/${notification.imagePath}`
      : null,
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
}
