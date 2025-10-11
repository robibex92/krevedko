import { BaseRepository } from "../core/base/BaseRepository.js";

/**
 * Repository for managing user favorites
 */
export class FavoriteRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "favorite");
  }

  /**
   * Find user's favorites
   */
  async findByUser(userId) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        product: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Check if product is in user's favorites
   */
  async isFavorite(userId, productId) {
    const favorite = await this.findOne({
      userId,
      productId,
    });
    return !!favorite;
  }

  /**
   * Add product to favorites
   */
  async addFavorite(userId, productId) {
    return this.prisma.favorite.upsert({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
      update: {},
      create: {
        userId,
        productId,
      },
    });
  }

  /**
   * Remove product from favorites
   */
  async removeFavorite(userId, productId) {
    try {
      return await this.prisma.favorite.delete({
        where: {
          userId_productId: {
            userId,
            productId,
          },
        },
      });
    } catch (error) {
      // If favorite doesn't exist, return null
      if (error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Clear all favorites for user
   */
  async clearUserFavorites(userId) {
    return this.prisma.favorite.deleteMany({
      where: { userId },
    });
  }

  /**
   * Get favorites count for user
   */
  async countByUser(userId) {
    return this.prisma.favorite.count({
      where: { userId },
    });
  }
}
