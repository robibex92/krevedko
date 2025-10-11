/**
 * User DTO (Data Transfer Object) transformers
 * Different views for different use cases to reduce response size
 */

/**
 * User profile view - для профиля пользователя
 * Use: GET /api/profile
 * Size: ~1 KB
 */
export function toUserProfileDTO(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarPath: user.avatarPath,
    role: user.role,
    referralCode: user.referralCode,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    telegramFirstName: user.telegramFirstName,
    telegramLastName: user.telegramLastName,
    telegramPhotoUrl: user.telegramPhotoUrl,
    addressStreet: user.addressStreet,
    addressHouse: user.addressHouse,
    addressApartment: user.addressApartment,
    loyaltyPoints: user.loyaltyPoints,
    createdAt: user.createdAt,
  };
}

/**
 * User public view - для публичной информации
 * Use: Reviews, comments, order history
 * Size: ~0.3 KB
 */
export function toUserPublicDTO(user) {
  return {
    id: user.id,
    name: user.name,
    avatarPath: user.avatarPath,
    telegramUsername: user.telegramUsername,
  };
}

/**
 * User auth view - для авторизации
 * Use: POST /api/auth/login, /register
 * Size: ~0.5 KB
 */
export function toUserAuthDTO(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

/**
 * User admin view - для админки
 * Use: GET /api/admin/users
 * Size: ~2 KB (все поля)
 */
export function toUserAdminDTO(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarPath: user.avatarPath,
    role: user.role,
    referralCode: user.referralCode,
    referredBy: user.referredBy,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    telegramFirstName: user.telegramFirstName,
    telegramLastName: user.telegramLastName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ========================================
// Helper functions for arrays
// ========================================

export function toUserProfileDTOArray(users) {
  return users.map(toUserProfileDTO);
}

export function toUserPublicDTOArray(users) {
  return users.map(toUserPublicDTO);
}

export function toUserAuthDTOArray(users) {
  return users.map(toUserAuthDTO);
}

export function toUserAdminDTOArray(users) {
  return users.map(toUserAdminDTO);
}
