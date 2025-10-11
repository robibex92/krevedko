import { BaseRepository } from "../core/base/BaseRepository.js";

/**
 * Repository для работы с OAuth аккаунтами
 */
export class OAuthRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "oAuthAccount");
  }

  /**
   * Найти OAuth аккаунт по провайдеру и ID провайдера
   */
  async findByProviderAndProviderId(provider, providerId) {
    return this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerId: {
          provider,
          providerId,
        },
      },
      include: {
        user: true,
      },
    });
  }

  /**
   * Найти все OAuth аккаунты пользователя
   */
  async findByUserId(userId) {
    return this.prisma.oAuthAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Создать OAuth аккаунт
   */
  async createOAuthAccount(data) {
    return this.prisma.oAuthAccount.create({
      data,
      include: {
        user: true,
      },
    });
  }

  /**
   * Обновить OAuth аккаунт (например, токены)
   */
  async updateOAuthAccount(id, data) {
    return this.prisma.oAuthAccount.update({
      where: { id },
      data,
      include: {
        user: true,
      },
    });
  }

  /**
   * Удалить OAuth аккаунт
   */
  async deleteOAuthAccount(userId, provider) {
    return this.prisma.oAuthAccount.deleteMany({
      where: {
        userId,
        provider,
      },
    });
  }

  /**
   * Найти OAuth аккаунт по email провайдера
   */
  async findByProviderAndEmail(provider, email) {
    if (!email) return null;

    return this.prisma.oAuthAccount.findFirst({
      where: {
        provider,
        email,
      },
      include: {
        user: true,
      },
    });
  }
}
