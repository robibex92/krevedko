import { BaseRepository } from "../core/base/BaseRepository.js";

export class CollectionRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "collection");
  }

  /**
   * Find active collections
   */
  async findActive() {
    return this.findMany(
      { status: "ACTIVE" },
      {
        orderBy: { startsAt: "desc" },
      }
    );
  }

  /**
   * Find collections by status
   */
  async findByStatus(status, options = {}) {
    return this.findMany(
      { status },
      {
        orderBy: [
          { startsAt: "desc" }, // Новые периоды сначала
          { id: "desc" }, // По ID как fallback
        ],
        ...options,
      }
    );
  }

  /**
   * Find collection with products
   */
  async findWithProducts(collectionId) {
    return this.findById(collectionId, {
      include: {
        products: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  /**
   * Activate collection
   */
  async activate(collectionId) {
    return this.update(collectionId, {
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: null,
    });
  }

  /**
   * Close collection
   */
  async close(collectionId) {
    return this.update(collectionId, {
      status: "CLOSED",
      endsAt: new Date(),
    });
  }

  /**
   * Get or create collection product override
   */
  async upsertCollectionProduct(collectionId, productId, data) {
    return this.prisma.collectionProduct.upsert({
      where: {
        collectionId_productId: {
          collectionId,
          productId,
        },
      },
      create: {
        collectionId,
        productId,
        ...data,
      },
      update: data,
    });
  }

  /**
   * Find collection product override
   */
  async findCollectionProduct(collectionId, productId) {
    return this.prisma.collectionProduct.findUnique({
      where: {
        collectionId_productId: {
          collectionId,
          productId,
        },
      },
    });
  }
}
