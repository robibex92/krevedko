import { BaseController } from "../core/base/BaseController.js";
import { ValidationError } from "../core/errors/AppError.js";

/**
 * Controller for notification endpoints
 */
export class NotificationController extends BaseController {
  constructor(notificationService) {
    super();
    this.notificationService = notificationService;
  }

  /**
   * GET /api/notifications/unread
   * Get unread notifications for current user
   */
  getUnreadNotifications = async (req, res) => {
    const userId = this.getUserId(req);

    const notifications =
      await this.notificationService.fetchUnreadNotifications(userId);

    this.success(res, { notifications });
  };

  /**
   * GET /api/notifications/history
   * Get notification history for current user
   */
  getNotificationHistory = async (req, res) => {
    const userId = this.getUserId(req);

    const notifications =
      await this.notificationService.fetchHistoryNotifications(userId);

    this.success(res, { notifications });
  };

  /**
   * GET /api/notifications
   * Get combined (unread + history) notifications
   */
  getCombinedNotifications = async (req, res) => {
    const userId = this.getUserId(req);

    const [unread, history] = await Promise.all([
      this.notificationService.fetchUnreadNotifications(userId),
      this.notificationService.fetchHistoryNotifications(userId),
    ]);

    this.success(res, { unread, history });
  };

  /**
   * GET /api/notifications/public
   * Get public notifications (no auth required)
   */
  getPublicNotifications = async (req, res) => {
    const notifications =
      await this.notificationService.fetchUnreadNotifications(null);

    this.success(res, { notifications });
  };

  /**
   * POST /api/notifications/:id/read
   * Mark notification as read
   */
  markAsRead = async (req, res) => {
    const userId = this.getUserId(req);
    const notificationId = this.getIdParam(req);

    const status = await this.notificationService.markAsRead(
      userId,
      notificationId
    );

    this.success(res, { status });
  };

  /**
   * POST /api/notifications/:id/dismiss
   * Mark notification as dismissed
   */
  markAsDismissed = async (req, res) => {
    const userId = this.getUserId(req);
    const notificationId = this.getIdParam(req);
    const dontShowAgain = Boolean(req.body?.dontShowAgain);

    const status = await this.notificationService.markAsDismissed(
      userId,
      notificationId,
      dontShowAgain
    );

    this.success(res, { status });
  };

  // --------------------------
  // Admin endpoints
  // --------------------------

  /**
   * GET /api/admin/notifications
   * Get all notifications (admin)
   */
  getAllNotifications = async (req, res) => {
    const notifications = await this.notificationService.getAllNotifications();

    this.success(res, { notifications });
  };

  /**
   * GET /api/admin/notifications/:id
   * Get single notification (admin)
   */
  getNotificationById = async (req, res) => {
    const notificationId = this.getIdParam(req);

    const notification = await this.notificationService.getNotificationById(
      notificationId
    );

    this.success(res, { notification });
  };

  /**
   * POST /api/admin/notifications
   * Create notification (admin)
   */
  createNotification = async (req, res) => {
    const notification = await this.notificationService.createNotification(
      req.body || {}
    );

    this.created(res, { notification });
  };

  /**
   * PATCH /api/admin/notifications/:id
   * Update notification (admin)
   */
  updateNotification = async (req, res) => {
    const notificationId = this.getIdParam(req);

    const notification = await this.notificationService.updateNotification(
      notificationId,
      req.body || {}
    );

    this.success(res, { notification });
  };

  /**
   * DELETE /api/admin/notifications/:id
   * Delete notification (admin)
   */
  deleteNotification = async (req, res) => {
    const notificationId = this.getIdParam(req);

    const result = await this.notificationService.deleteNotification(
      notificationId
    );

    this.success(res, result);
  };

  /**
   * POST /api/admin/notifications/upload
   * Upload notification image (admin)
   * Note: This endpoint uses multer middleware directly in routes
   */
  uploadImage = async (req, res) => {
    if (!req.file) {
      throw new ValidationError("No file received", "NO_FILE");
    }

    const relPath = ["notifications", req.file.filename].join("/");

    this.success(res, {
      file: {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: relPath,
        url: `/uploads/${relPath}`,
      },
    });
  };
}
