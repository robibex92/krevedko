import { BaseRepository } from "../core/base/BaseRepository.js";

/**
 * Repository for managing refresh tokens
 */
export class RefreshTokenRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "refreshToken");
  }

  /**
   * Find refresh token by JTI
   */
  async findByJti(jti) {
    return this.findOne({ jti });
  }

  /**
   * Create refresh token
   */
  async createToken(data) {
    return this.create({
      userId: data.userId,
      jti: data.jti,
      expiresAt: data.expiresAt,
      createdByIp: data.createdByIp || null,
    });
  }

  /**
   * Revoke refresh token by JTI
   */
  async revokeByJti(jti, replacedByJti = null) {
    const token = await this.findByJti(jti);
    if (!token) return null;

    return this.prisma.refreshToken.update({
      where: { jti },
      data: {
        revokedAt: new Date(),
        replacedByJti,
      },
    });
  }

  /**
   * Revoke all active tokens for a user
   */
  async revokeAllForUser(userId) {
    return this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Check if token is valid (not revoked, not expired)
   */
  async isTokenValid(jti) {
    const token = await this.findByJti(jti);
    if (!token) return false;
    if (token.revokedAt) return false;
    if (token.expiresAt < new Date()) return false;
    return true;
  }

  /**
   * Clean up expired tokens (for maintenance tasks)
   */
  async deleteExpired() {
    return this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }

  /**
   * Get active tokens count for user
   */
  async getActiveTokensCount(userId) {
    return this.prisma.refreshToken.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }
}
