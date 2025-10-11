import { BaseRepository } from "../core/base/BaseRepository.js";

export class UserRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "user");
  }

  /**
   * Find user by email
   */
  async findByEmail(email) {
    return this.findOne({ email: email.toLowerCase().trim() });
  }

  /**
   * Find user by telegram ID
   */
  async findByTelegramId(telegramId) {
    return this.findOne({ telegramId: String(telegramId) });
  }

  /**
   * Find user by referral code
   */
  async findByReferralCode(code) {
    return this.findOne({ referralCode: code });
  }

  /**
   * Create user with email
   */
  async createWithEmail(data) {
    return this.create({
      ...data,
      email: data.email.toLowerCase().trim(),
    });
  }

  /**
   * Create user with telegram
   */
  async createWithTelegram(telegramData) {
    const { id, first_name, last_name, username, photo_url } = telegramData;

    return this.create({
      telegramId: String(id),
      telegramUsername: username || null,
      telegramPhotoUrl: photo_url || null,
      firstName: first_name || null,
      lastName: last_name || null,
      name: [first_name, last_name].filter(Boolean).join(" ") || null,
    });
  }

  /**
   * Update user email
   */
  async updateEmail(userId, email) {
    return this.update(userId, {
      email: email.toLowerCase().trim(),
      emailVerifiedAt: null,
    });
  }

  /**
   * Verify email
   */
  async verifyEmail(userId) {
    return this.update(userId, {
      emailVerifiedAt: new Date(),
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    });
  }

  /**
   * Set email verification token
   */
  async setEmailVerificationToken(userId, tokenHash, expiresAt) {
    return this.update(userId, {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: expiresAt,
    });
  }

  /**
   * Set password reset token
   */
  async setPasswordResetToken(userId, tokenHash, expiresAt) {
    return this.update(userId, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    });
  }

  /**
   * Update password
   */
  async updatePassword(userId, passwordHash) {
    return this.update(userId, {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    });
  }

  /**
   * Link telegram account
   */
  async linkTelegram(userId, telegramData) {
    const { id, username, photo_url } = telegramData;

    return this.update(userId, {
      telegramId: String(id),
      telegramUsername: username || null,
      telegramPhotoUrl: photo_url || null,
    });
  }

  /**
   * Unlink telegram account
   */
  async unlinkTelegram(userId) {
    return this.update(userId, {
      telegramId: null,
      telegramUsername: null,
      telegramPhotoUrl: null,
    });
  }

  /**
   * Update loyalty points
   */
  async updateLoyaltyPoints(userId, points) {
    return this.update(userId, { loyaltyPoints: points });
  }

  /**
   * Increment loyalty points
   */
  async incrementLoyaltyPoints(userId, amount) {
    const user = await this.findByIdOrFail(userId);
    return this.updateLoyaltyPoints(userId, user.loyaltyPoints + amount);
  }

  /**
   * Update user with merge data (for account merging)
   */
  async updateWithMerge(userId, updateData, preferExisting = true) {
    const user = await this.findByIdOrFail(userId);

    const mergedData = { ...updateData };

    // If preferExisting is true, only update fields that are null in existing user
    if (preferExisting) {
      Object.keys(updateData).forEach((key) => {
        if (user[key] !== null && user[key] !== undefined) {
          delete mergedData[key];
        }
      });
    }

    return this.update(userId, mergedData);
  }

  /**
   * Release telegram fields (for account merging)
   */
  async releaseTelegramFields(userId) {
    return this.update(userId, {
      telegramId: null,
      telegramUsername: null,
      telegramPhotoUrl: null,
    });
  }

  /**
   * Check if user has alternative auth method (for preventing lockout)
   */
  async hasAlternativeAuthMethod(userId) {
    const user = await this.findByIdOrFail(userId);

    const hasPassword = Boolean(user.passwordHash);
    const hasVerifiedEmail = Boolean(user.email && user.emailVerifiedAt);

    return hasPassword || hasVerifiedEmail;
  }

  /**
   * Find orphan telegram account (for merging)
   */
  async findOrphanTelegramAccount(telegramId, excludeUserId) {
    return this.prisma.user.findFirst({
      where: {
        telegramId: String(telegramId),
        email: null,
        id: { not: excludeUserId },
      },
    });
  }
}
