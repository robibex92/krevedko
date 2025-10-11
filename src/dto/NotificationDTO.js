/**
 * Notification DTO (Data Transfer Object) transformers
 */

/**
 * Notification list view - для списка уведомлений
 */
export function toNotificationListDTO(notification) {
  return {
    id: notification.id,
    title: notification.title,
    content: notification.content,
    priority: notification.priority,
    imagePath: notification.imagePath,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

/**
 * Notification detail view - детальная информация
 */
export function toNotificationDetailDTO(notification) {
  return {
    ...toNotificationListDTO(notification),
    slug: notification.slug,
    audience: notification.audience,
    scheduledFor: notification.scheduledFor,
  };
}

/**
 * Notification admin view - для админки
 */
export function toNotificationAdminDTO(notification) {
  return {
    id: notification.id,
    title: notification.title,
    content: notification.content,
    priority: notification.priority,
    imagePath: notification.imagePath,
    slug: notification.slug,
    audience: notification.audience,
    targetUserIds: notification.targetUserIds,
    scheduledFor: notification.scheduledFor,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

// Helper functions
export function toNotificationListDTOArray(notifications) {
  return notifications.map(toNotificationListDTO);
}

export function toNotificationDetailDTOArray(notifications) {
  return notifications.map(toNotificationDetailDTO);
}

export function toNotificationAdminDTOArray(notifications) {
  return notifications.map(toNotificationAdminDTO);
}
