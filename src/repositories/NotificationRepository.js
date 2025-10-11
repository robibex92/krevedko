import { BaseRepository } from "../core/base/BaseRepository.js";
import { slugifyNotificationSlug } from "../utils/notificationHelpers.js";

/**
 * Repository for notification management
 */
export class NotificationRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "notification");
  }

  /**
   * Get all notifications with ordering
   */
  async findAllWithOrdering(orderBy = [{ createdAt: "desc" }]) {
    return this.findMany({}, { orderBy });
  }

  /**
   * Get active notifications with optional user statuses
   */
  async findActiveWithUserStatuses(userId = null) {
    const query = {
      where: { isActive: true },
      orderBy: [
        { priority: "desc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
    };

    if (userId) {
      query.include = { statuses: { where: { userId } } };
    }

    return this.prisma.notification.findMany(query);
  }

  /**
   * Ensure unique slug for notification
   */
  async ensureUniqueSlug(desiredSlug, excludeId = null) {
    const base = slugifyNotificationSlug(desiredSlug);
    let candidate = base;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.notification.findUnique({
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

  /**
   * Delete notification with cascade (statuses)
   */
  async deleteWithStatuses(notificationId) {
    await this.prisma.$transaction([
      this.prisma.userNotificationStatus.deleteMany({
        where: { notificationId },
      }),
      this.prisma.notification.delete({ where: { id: notificationId } }),
    ]);
  }

  // ---------------------------
  // User Notification Status
  // ---------------------------

  /**
   * Get user notification status
   */
  async findUserStatus(userId, notificationId) {
    return this.prisma.userNotificationStatus.findUnique({
      where: { userId_notificationId: { userId, notificationId } },
    });
  }

  /**
   * Upsert user notification status (mark as read)
   */
  async markAsRead(userId, notificationId) {
    const now = new Date();
    return this.prisma.userNotificationStatus.upsert({
      where: { userId_notificationId: { userId, notificationId } },
      create: {
        userId,
        notificationId,
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
  }

  /**
   * Upsert user notification status (mark as dismissed)
   */
  async markAsDismissed(userId, notificationId, dontShowAgain = false) {
    const now = new Date();
    return this.prisma.userNotificationStatus.upsert({
      where: { userId_notificationId: { userId, notificationId } },
      create: {
        userId,
        notificationId,
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
  }

  /**
   * Get user notification history
   */
  async findUserHistory(userId, limit = 100) {
    return this.prisma.userNotificationStatus.findMany({
      where: { userId, status: { in: ["READ", "DISMISSED"] } },
      include: { notification: true },
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
    });
  }
}
