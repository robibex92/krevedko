import { BaseRepository } from "../core/base/BaseRepository.js";

export class CartRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "cartItem");
  }

  /**
   * Find cart items by user and collection
   */
  async findByUserAndCollection(userId, collectionId, options = {}) {
    return this.findMany(
      { userId, collectionId },
      {
        include: { product: true },
        orderBy: { id: "asc" },
        ...options,
      }
    );
  }

  /**
   * Find all cart items by user
   */
  async findByUser(userId, options = {}) {
    return this.findMany(
      { userId },
      {
        include: { product: true, collection: true },
        orderBy: { id: "asc" },
        ...options,
      }
    );
  }

  /**
   * Find cart item
   */
  async findCartItem(userId, collectionId, productId) {
    return this.findOne({
      userId,
      collectionId,
      productId,
    });
  }

  /**
   * Add or update cart item
   */
  async upsertItem(userId, collectionId, productId, quantity, unitPrice) {
    return this.upsert(
      {
        userId_collectionId_productId: {
          userId,
          collectionId,
          productId,
        },
      },
      {
        userId,
        collectionId,
        productId,
        quantityDecimal: String(quantity),
        unitPriceKopecks: unitPrice,
        isActive: true,
      },
      {
        quantityDecimal: String(quantity),
        unitPriceKopecks: unitPrice,
        isActive: true,
      }
    );
  }

  /**
   * Remove cart item
   */
  async removeItem(userId, collectionId, productId) {
    return this.deleteMany({
      userId,
      collectionId,
      productId,
    });
  }

  /**
   * Clear cart for user and collection
   */
  async clearCart(userId, collectionId) {
    return this.deleteMany({
      userId,
      collectionId,
    });
  }

  /**
   * Clear all user carts
   */
  async clearAllUserCarts(userId) {
    return this.deleteMany({ userId });
  }

  /**
   * Count cart items
   */
  async countByUser(userId, collectionIds = null) {
    const where = { userId };
    if (collectionIds) {
      where.collectionId = { in: collectionIds };
    }
    return this.count(where);
  }

  /**
   * Mark items as inactive
   */
  async markInactive(userId, collectionId, productIds) {
    return this.updateMany(
      {
        userId,
        collectionId,
        productId: { in: productIds },
      },
      { isActive: false }
    );
  }
}
