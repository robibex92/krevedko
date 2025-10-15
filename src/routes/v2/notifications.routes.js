import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { notificationUpload } from "../../services/uploads.js";

/**
 * Create notification routes
 */
export function createNotificationRoutes(container) {
  const router = Router();
  const notificationController = container.resolve("notificationController");

  // Public routes
  router.get(
    "/notifications/public",
    asyncHandler(notificationController.getPublicNotifications)
  );

  // Protected user routes
  router.get(
    "/notifications/unread",
    requireAuth,
    asyncHandler(notificationController.getUnreadNotifications)
  );

  router.get(
    "/notifications/history",
    requireAuth,
    asyncHandler(notificationController.getNotificationHistory)
  );

  router.get(
    "/notifications",
    requireAuth,
    asyncHandler(notificationController.getCombinedNotifications)
  );

  router.post(
    "/notifications/:id/read",
    requireAuth,
    asyncHandler(notificationController.markAsRead)
  );

  router.post(
    "/notifications/:id/dismiss",
    requireAuth,
    asyncHandler(notificationController.markAsDismissed)
  );

  // Admin routes
  router.get(
    "/admin/notifications",
    requireAuth,
    requireAdmin,
    asyncHandler(notificationController.getAllNotifications)
  );

  router.get(
    "/admin/notifications/:id",
    requireAuth,
    requireAdmin,
    asyncHandler(notificationController.getNotificationById)
  );

  router.post(
    "/admin/notifications",
    requireAuth,
    requireAdmin,
    asyncHandler(notificationController.createNotification)
  );

  router.patch(
    "/admin/notifications/:id",
    requireAuth,
    requireAdmin,
    asyncHandler(notificationController.updateNotification)
  );

  router.delete(
    "/admin/notifications/:id",
    requireAuth,
    requireAdmin,
    asyncHandler(notificationController.deleteNotification)
  );

  router.post(
    "/admin/notifications/upload",
    requireAuth,
    requireAdmin,
    notificationUploadBase.single("image"),
    asyncHandler(notificationController.uploadImage)
  );

  return router;
}
