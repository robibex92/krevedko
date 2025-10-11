/**
 * Application-wide constants
 */

// Collection status
export const COLLECTION_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
};

// Order status
export const ORDER_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  PREPARING: "PREPARING",
  READY: "READY",
  DELIVERING: "DELIVERING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

// Delivery types
export const DELIVERY_TYPE = {
  PICKUP: "PICKUP",
  DELIVERY: "DELIVERY",
};

// User roles
export const USER_ROLE = {
  CUSTOMER: "CUSTOMER",
  ADMIN: "ADMIN",
};

// Stock display hints
export const STOCK_HINT = {
  IN_STOCK: "IN",
  LOW_STOCK: "LOW",
  OUT_OF_STOCK: "OUT",
};

// Notification priority
export const NOTIFICATION_PRIORITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
};

// Notification audience
export const NOTIFICATION_AUDIENCE = {
  ALL: "ALL",
  CUSTOMERS: "CUSTOMERS",
  CUSTOM: "CUSTOM",
};

// Recipe status
export const RECIPE_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
};

// Content block types
export const CONTENT_BLOCK_TYPE = {
  TEXT: "text",
  HEADING: "heading",
  IMAGE: "image",
  VIDEO: "video",
  QUOTE: "quote",
};

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
};

// JWT Token TTL
export const JWT_TTL = {
  ACCESS_TOKEN: "24h",
  REFRESH_TOKEN: "30d",
  ROTATE_THRESHOLD_DAYS: 7,
};

// Price calculations
export const PRICE = {
  KOPECKS_PER_RUBLE: 100,
  MIN_DELIVERY_COST_KOPECKS: 0,
  FREE_DELIVERY_THRESHOLD_KOPECKS: 500000, // 5000 rubles
};

// File upload limits
export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILES_PER_UPLOAD: 10,
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  ALLOWED_VIDEO_TYPES: ["video/mp4", "video/webm"],
};

// Email verification
export const EMAIL_VERIFICATION = {
  TOKEN_EXPIRY_HOURS: 24,
  RESEND_COOLDOWN_MINUTES: 5,
};

// Password reset
export const PASSWORD_RESET = {
  TOKEN_EXPIRY_HOURS: 1,
  MIN_PASSWORD_LENGTH: 6,
};

// Referral program
export const REFERRAL = {
  CODE_LENGTH: 8,
  BONUS_POINTS: 100,
};

// Cache TTL (in seconds)
export const CACHE_TTL = {
  PRODUCTS: 300, // 5 minutes
  COLLECTIONS: 60, // 1 minute
  CATEGORIES: 600, // 10 minutes
};

// Rate limiting
export const RATE_LIMIT = {
  AUTH_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  AUTH_MAX_REQUESTS: 100,
  API_WINDOW_MS: 60 * 1000, // 1 minute
  API_MAX_REQUESTS: 1000,
};

// Session
export const SESSION = {
  MAX_AGE_DAYS: 30,
  COOKIE_NAME: "sid",
};

// Telegram message queue
export const TELEGRAM_QUEUE = {
  POLL_INTERVAL_MS: 10000, // 10 seconds
  MAX_RETRIES: 3,
};
