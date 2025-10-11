import { BaseRepository } from "../core/base/BaseRepository.js";

export class OrderRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "order");
  }

  /**
   * Find orders by user
   */
  async findByUser(userId, options = {}) {
    return this.findMany(
      { userId },
      {
        orderBy: { submittedAt: "desc" },
        ...options,
      }
    );
  }

  /**
   * Find orders by user with pagination
   */
  async findByUserPaginated(userId, paginationOptions) {
    return this.findWithPagination(
      { userId },
      {
        ...paginationOptions,
        orderBy: { submittedAt: "desc" },
      }
    );
  }

  /**
   * Find orders by status
   */
  async findByStatus(status, options = {}) {
    return this.findMany(
      { status },
      {
        orderBy: { submittedAt: "desc" },
        ...options,
      }
    );
  }

  /**
   * Find orders by collection
   */
  async findByCollection(collectionId, options = {}) {
    return this.findMany(
      { collectionId },
      {
        orderBy: { submittedAt: "desc" },
        ...options,
      }
    );
  }

  /**
   * Find order with details
   */
  async findWithDetails(orderId) {
    return this.findById(orderId, {
      include: {
        items: true,
        proofs: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            telegramUsername: true,
          },
        },
        collection: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  /**
   * Find all orders with details (admin)
   */
  async findAllWithDetails(options = {}) {
    return this.findMany(
      {},
      {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              telegramUsername: true,
              firstName: true,
              lastName: true,
              avatarPath: true,
            },
          },
          collection: {
            select: {
              id: true,
              title: true,
            },
          },
          items: true,
          proofs: true,
        },
        orderBy: { submittedAt: "desc" },
        ...options,
      }
    );
  }

  /**
   * Update order status
   */
  async updateStatus(orderId, status) {
    return this.update(orderId, { status });
  }

  /**
   * Update delivery info
   */
  async updateDelivery(orderId, deliveryType, deliveryAddress = null) {
    return this.update(orderId, {
      deliveryType,
      deliveryAddress: deliveryType === "DELIVERY" ? deliveryAddress : null,
    });
  }

  /**
   * Create order with items
   */
  async createWithItems(userId, collectionId, orderData, items) {
    return this.prisma.$transaction(async (tx) => {
      // Create order
      const order = await tx.order.create({
        data: {
          userId,
          collectionId,
          status: orderData.status || "SUBMITTED",
          totalKopecks: orderData.totalKopecks,
          deliveryType: orderData.deliveryType || "PICKUP",
          deliveryAddress: orderData.deliveryAddress || null,
          deliveryCost: orderData.deliveryCost || 0,
          orderNumber: orderData.orderNumber || null,
        },
      });

      // Create order items
      for (const item of items) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            titleSnapshot: item.titleSnapshot,
            unitLabelSnapshot: item.unitLabelSnapshot,
            quantityDecimal: item.quantityDecimal,
            unitPriceKopecks: item.unitPriceKopecks,
            subtotalKopecks: item.subtotalKopecks,
            imagePathSnapshot: item.imagePathSnapshot || null,
          },
        });
      }

      return order;
    });
  }

  /**
   * Count orders by user
   */
  async countByUser(userId) {
    return this.count({ userId });
  }

  /**
   * Count orders by status
   */
  async countByStatus(status) {
    return this.count({ status });
  }

  /**
   * Get order statistics
   */
  async getStatistics(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const orders = await this.findMany({
      submittedAt: { gte: since },
    });

    const stats = {
      total: orders.length,
      submitted: orders.filter((o) => o.status === "SUBMITTED").length,
      paid: orders.filter((o) => o.status === "PAID").length,
      cancelled: orders.filter((o) => o.status === "CANCELLED").length,
      totalRevenue: orders
        .filter((o) => o.status === "PAID")
        .reduce((sum, o) => sum + o.totalKopecks, 0),
    };

    return stats;
  }
}
