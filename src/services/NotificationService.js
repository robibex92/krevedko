import { NotFoundError, ValidationError } from "../core/errors/AppError.js";
import {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_AUDIENCE,
  sanitizeImagePath,
  sanitizeExternalLink,
  parseBooleanFlag,
  parseDate,
  parseAudienceFilter,
  isNowWithinSchedule,
  matchesAudience,
  normalizeNotificationPayload,
} from "../utils/notificationHelpers.js";
import { bbcodeToHtml, bbcodeToText } from "../utils/bbcode.js";

/**
 * Service for notification management
 */
export class NotificationService {
  constructor(notificationRepository, userRepository) {
    this.notificationRepo = notificationRepository;
    this.userRepo = userRepository;
  }

  /**
   * Fetch unread notifications for user (with filtering logic)
   */
  async fetchUnreadNotifications(userId = null) {
    // Get user info if authenticated
    const rawUser = userId
      ? await this.userRepo.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            role: true,
            createdAt: true,
            loyaltyPoints: true,
            _count: { select: { orders: true } },
          },
        })
      : null;

    // Get active notifications with statuses
    const notifications =
      await this.notificationRepo.findActiveWithUserStatuses(userId);

    const now = new Date();
    const payload = [];

    for (const notification of notifications) {
      // Check schedule
      if (!isNowWithinSchedule(notification, now)) continue;

      // Check audience
      if (notification.audience === "CUSTOM" && !rawUser) continue;
      if (rawUser && !matchesAudience(notification, rawUser)) continue;

      // Check user status
      const statuses = Array.isArray(notification.statuses)
        ? notification.statuses
        : [];
      const status = statuses[0] || null;

      if (userId && status) {
        if (status.dontShowAgain) continue;
        if (
          notification.showOnce &&
          (status.status === "READ" || status.status === "DISMISSED")
        ) {
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

  /**
   * Fetch notification history for user
   */
  async fetchHistoryNotifications(userId) {
    const statuses = await this.notificationRepo.findUserHistory(userId);

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

  /**
   * Mark notification as read
   */
  async markAsRead(userId, notificationId) {
    const record = await this.notificationRepo.markAsRead(
      userId,
      notificationId
    );

    return {
      status: record.status,
      readAt: record.readAt,
      dismissedAt: record.dismissedAt,
      dontShowAgain: record.dontShowAgain,
    };
  }

  /**
   * Mark notification as dismissed
   */
  async markAsDismissed(userId, notificationId, dontShowAgain = false) {
    const record = await this.notificationRepo.markAsDismissed(
      userId,
      notificationId,
      dontShowAgain
    );

    return {
      status: record.status,
      readAt: record.readAt,
      dismissedAt: record.dismissedAt,
      dontShowAgain: record.dontShowAgain,
    };
  }

  // --------------------------
  // Admin methods
  // --------------------------

  /**
   * Get all notifications (admin)
   */
  async getAllNotifications() {
    const notifications = await this.notificationRepo.findAllWithOrdering([
      { createdAt: "desc" },
    ]);
    return notifications.map((n) => normalizeNotificationPayload(n));
  }

  /**
   * Get single notification (admin)
   */
  async getNotificationById(notificationId) {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification) {
      throw new NotFoundError(
        "Notification not found",
        "NOTIFICATION_NOT_FOUND"
      );
    }
    return normalizeNotificationPayload(notification);
  }

  /**
   * Create notification (admin)
   */
  async createNotification(data) {
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
    } = data;

    // Validation
    if (!title) {
      throw new ValidationError("Title is required", "TITLE_REQUIRED");
    }
    if (bodyBbcode === undefined || bodyBbcode === null) {
      throw new ValidationError("Body is required", "BODY_REQUIRED");
    }

    // Sanitize and normalize
    const safePriority = NOTIFICATION_PRIORITIES.has(
      String(priority || "").toUpperCase()
    )
      ? String(priority).toUpperCase()
      : "MEDIUM";

    const safeAudience = NOTIFICATION_AUDIENCE.has(
      String(audience || "").toUpperCase()
    )
      ? String(audience).toUpperCase()
      : "ALL";

    const safeFilter =
      safeAudience === "CUSTOM" ? parseAudienceFilter(audienceFilter) : null;
    const safeSlug = await this.notificationRepo.ensureUniqueSlug(
      slug || title
    );
    const safeImagePath = sanitizeImagePath(imagePath);
    const safeLink = sanitizeExternalLink(linkUrl);
    const safeStartsAt = parseDate(startsAt);
    const safeEndsAt = parseDate(endsAt);
    const safePublishedAt = parseDate(publishedAt);
    const safeIsActive = parseBooleanFlag(isActive, true);
    const safeShowOnce = parseBooleanFlag(showOnce, false);

    const html = bbcodeToHtml(bodyBbcode || "");
    const textExcerpt =
      excerpt && String(excerpt).trim()
        ? String(excerpt).trim()
        : bbcodeToText(bodyBbcode || "").slice(0, 280);

    const created = await this.notificationRepo.create({
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
    });

    return normalizeNotificationPayload(created);
  }

  /**
   * Update notification (admin)
   */
  async updateNotification(notificationId, data) {
    const existing = await this.notificationRepo.findById(notificationId);
    if (!existing) {
      throw new NotFoundError(
        "Notification not found",
        "NOTIFICATION_NOT_FOUND"
      );
    }

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
    } = data;

    const updateData = {};

    if (title !== undefined) updateData.title = String(title).trim();

    if (slug !== undefined) {
      updateData.slug = await this.notificationRepo.ensureUniqueSlug(
        slug || title || existing.title,
        notificationId
      );
    }

    if (excerpt !== undefined) {
      const trimmed = String(excerpt || "").trim();
      updateData.excerpt = trimmed || null;
    }

    if (bodyBbcode !== undefined) {
      const source = bodyBbcode || "";
      updateData.bodyBbcode = source;
      updateData.bodyHtml = bbcodeToHtml(source);
      if (excerpt === undefined) {
        const textExcerpt = bbcodeToText(source).slice(0, 280);
        updateData.excerpt = textExcerpt || existing.excerpt;
      }
    }

    if (imagePath !== undefined) {
      updateData.imagePath = sanitizeImagePath(imagePath);
    }

    if (linkUrl !== undefined) {
      updateData.linkUrl = sanitizeExternalLink(linkUrl);
    }

    if (priority !== undefined) {
      const safePriority = NOTIFICATION_PRIORITIES.has(
        String(priority || "").toUpperCase()
      )
        ? String(priority).toUpperCase()
        : existing.priority;
      updateData.priority = safePriority;
    }

    if (audience !== undefined) {
      const safeAudience = NOTIFICATION_AUDIENCE.has(
        String(audience || "").toUpperCase()
      )
        ? String(audience).toUpperCase()
        : existing.audience;
      updateData.audience = safeAudience;
      const filter =
        safeAudience === "CUSTOM"
          ? parseAudienceFilter(audienceFilter ?? existing.audienceFilter)
          : null;
      updateData.audienceFilter = filter;
    } else if (audienceFilter !== undefined && existing.audience === "CUSTOM") {
      updateData.audienceFilter = parseAudienceFilter(audienceFilter);
    }

    if (isActive !== undefined) {
      updateData.isActive = parseBooleanFlag(isActive, existing.isActive);
    }

    if (showOnce !== undefined) {
      updateData.showOnce = parseBooleanFlag(showOnce, existing.showOnce);
    }

    if (startsAt !== undefined) updateData.startsAt = parseDate(startsAt);
    if (endsAt !== undefined) updateData.endsAt = parseDate(endsAt);
    if (publishedAt !== undefined)
      updateData.publishedAt = parseDate(publishedAt);

    const updated = await this.notificationRepo.update(
      notificationId,
      updateData
    );
    return normalizeNotificationPayload(updated);
  }

  /**
   * Delete notification (admin)
   */
  async deleteNotification(notificationId) {
    await this.notificationRepo.deleteWithStatuses(notificationId);
    return { ok: true };
  }
}
