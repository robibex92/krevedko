import {
  BusinessLogicError,
  ValidationError,
} from "../core/errors/AppError.js";
import { dec, isMultipleOf } from "../core/utils/decimal.js";
import { COLLECTION_STATUS, ORDER_STATUS } from "../constants/index.js";

export class OrderService {
  constructor(
    orderRepository,
    cartRepository,
    productRepository,
    collectionRepository,
    pricingService,
    inventoryService
  ) {
    this.orderRepo = orderRepository;
    this.cartRepo = cartRepository;
    this.productRepo = productRepository;
    this.collectionRepo = collectionRepository;
    this.pricingService = pricingService;
    this.inventoryService = inventoryService;
  }

  /**
   * Create order from cart
   */
  async createFromCart(userId, collectionId, deliveryData) {
    // Get cart items
    const cartItems = await this.cartRepo.findByUserAndCollection(
      userId,
      collectionId,
      {
        include: { product: true },
      }
    );

    if (!cartItems.length) {
      throw new BusinessLogicError("Cart is empty", "CART_EMPTY");
    }

    // Validate collection is active
    const collection = await this.collectionRepo.findByIdOrFail(collectionId);
    if (collection.status !== COLLECTION_STATUS.ACTIVE) {
      throw new BusinessLogicError(
        "Collection is not active",
        "COLLECTION_NOT_ACTIVE"
      );
    }

    // Prepare and validate order items
    const { items, total } = await this._prepareOrderItems(
      cartItems,
      collectionId
    );

    // Calculate delivery cost
    const deliveryCost = this._calculateDeliveryCost(
      deliveryData.deliveryType,
      total
    );
    const finalTotal = total.add(dec(deliveryCost));

    // Create order in transaction
    const order = await this.orderRepo.prisma.$transaction(async (tx) => {
      // Create order without orderNumber first
      const createdOrder = await tx.order.create({
        data: {
          userId,
          collectionId,
          status: "SUBMITTED",
          totalKopecks: finalTotal.toNumber(),
          deliveryType: deliveryData.deliveryType || "PICKUP",
          deliveryAddress: deliveryData.deliveryAddress || null,
          deliveryCost,
          paymentMethod: deliveryData.paymentMethod || "development",
        },
      });

      // Generate and update order number based on order ID
      const orderNumber = this._generateOrderNumber(createdOrder.id);
      await tx.order.update({
        where: { id: createdOrder.id },
        data: { orderNumber },
      });
      createdOrder.orderNumber = orderNumber;

      // Create order items and update stock
      for (const item of items) {
        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: item.productId,
            titleSnapshot: item.titleSnapshot,
            unitLabelSnapshot: item.unitLabelSnapshot,
            quantityDecimal: item.quantityDecimal,
            unitPriceKopecks: item.unitPriceKopecks,
            subtotalKopecks: item.subtotalKopecks,
            imagePathSnapshot: item.imagePathSnapshot,
          },
        });

        // Decrease stock
        await this.inventoryService.decreaseStock(
          tx,
          item.productId,
          item.quantityDecimal
        );
      }

      // Clear cart
      await tx.cartItem.deleteMany({
        where: { userId, collectionId },
      });

      return createdOrder;
    });

    return order;
  }

  /**
   * Get user orders
   */
  async getUserOrders(userId, options = {}) {
    return this.orderRepo.findByUser(userId, options);
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId, userId = null) {
    const order = await this.orderRepo.findWithDetails(orderId);

    if (!order) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    // Check ownership if userId provided
    if (userId && order.userId !== userId) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    return order;
  }

  /**
   * Update order status
   */
  async updateStatus(orderId, newStatus) {
    const allowedStatuses = ["SUBMITTED", "PAID", "CANCELLED"];
    if (!allowedStatuses.includes(newStatus)) {
      throw new ValidationError("Invalid status");
    }

    const order = await this.orderRepo.findByIdOrFail(orderId);

    // If cancelling, return stock
    if (newStatus === "CANCELLED" && order.status !== "CANCELLED") {
      await this._returnStockForOrder(orderId);
    }

    return this.orderRepo.updateStatus(orderId, newStatus);
  }

  /**
   * Repeat order
   */
  async repeatOrder(orderId, userId, targetCollectionId) {
    const order = await this.orderRepo.findOne(
      { id: orderId, userId },
      { include: { items: true } }
    );

    if (!order) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    // Validate target collection
    const collection =
      await this.collectionRepo.findByIdOrFail(targetCollectionId);
    if (collection.status !== "ACTIVE") {
      throw new BusinessLogicError(
        "Collection is not active",
        "COLLECTION_NOT_ACTIVE"
      );
    }

    // Add items to cart
    const addedItems = [];
    for (const item of order.items) {
      try {
        const product = await this.productRepo.findById(item.productId);
        if (!product || !product.isActive) continue;

        const pricing = await this.pricingService.getProductPricing(
          item.productId,
          targetCollectionId
        );

        if (!pricing.isAvailable) continue;

        // Adjust quantity to step
        let quantity = dec(item.quantityDecimal.toString());
        const step = dec(pricing.step);
        const remainder = quantity.mod(step);
        if (!remainder.isZero()) {
          quantity = quantity.sub(remainder);
        }

        if (quantity.lte(0)) continue;

        await this.cartRepo.upsertItem(
          userId,
          targetCollectionId,
          item.productId,
          quantity.toString(),
          pricing.price
        );

        addedItems.push(item.productId);
      } catch (error) {
        console.error(
          `Failed to add product ${item.productId} to cart:`,
          error
        );
      }
    }

    return { addedItems: addedItems.length };
  }

  /**
   * Get all orders (admin)
   */
  async getAllOrders(options = {}) {
    return this.orderRepo.findAllWithDetails(options);
  }

  /**
   * Get order statistics
   */
  async getStatistics(days = 7) {
    return this.orderRepo.getStatistics(days);
  }

  /**
   * Private: Prepare order items from cart
   */
  async _prepareOrderItems(cartItems, collectionId) {
    const items = [];
    let total = dec(0);

    for (const cartItem of cartItems) {
      const product = cartItem.product;

      // Get pricing
      const pricing = await this.pricingService.getProductPricing(
        product.id,
        collectionId
      );

      if (!pricing.isAvailable) {
        throw new BusinessLogicError(
          `Product ${product.title} is not available`,
          "PRODUCT_NOT_AVAILABLE"
        );
      }

      // Validate quantity
      const quantity = cartItem.quantityDecimal.toString();
      const step = pricing.step.toString();

      if (!isMultipleOf(quantity, step)) {
        throw new ValidationError(`Quantity must be multiple of ${step}`, {
          product: product.title,
          step,
        });
      }

      // Calculate subtotal
      const steps = dec(quantity).div(dec(step));
      const subtotal = dec(pricing.price).mul(steps);

      if (!subtotal.mod(1).eq(0)) {
        throw new BusinessLogicError(
          "Price calculation error",
          "PRICE_STEP_MISMATCH"
        );
      }

      items.push({
        productId: product.id,
        titleSnapshot: product.title,
        unitLabelSnapshot: product.unitLabel,
        quantityDecimal: quantity,
        unitPriceKopecks: pricing.price,
        subtotalKopecks: subtotal.toNumber(),
        imagePathSnapshot: product.imagePath,
      });

      total = total.add(subtotal);
    }

    return { items, total };
  }

  /**
   * Private: Calculate delivery cost
   */
  _calculateDeliveryCost(deliveryType, totalAmount) {
    if (deliveryType !== "DELIVERY") return 0;

    // Free delivery for orders over 3000 rubles
    if (totalAmount.gte(300000)) return 0;

    // Otherwise could add delivery fee
    return 0;
  }

  /**
   * Private: Generate order number
   * Simple sequential format: ORD-00001, ORD-00002, etc.
   * Order ID is used as the sequence number
   */
  _generateOrderNumber(orderId) {
    return `ORD-${String(orderId).padStart(5, "0")}`;
  }

  /**
   * Private: Return stock for cancelled order
   */
  async _returnStockForOrder(orderId) {
    const order = await this.orderRepo.findOne(
      { id: orderId },
      { include: { items: true } }
    );

    if (!order) return;

    for (const item of order.items) {
      try {
        await this.inventoryService.increaseStock(
          this.orderRepo.prisma,
          item.productId,
          item.quantityDecimal.toString()
        );
      } catch (error) {
        console.error(
          `Failed to return stock for product ${item.productId}:`,
          error
        );
      }
    }
  }

  /**
   * Create order from guest cart (for unauthenticated users)
   * @param {string} sessionId - Guest session ID
   * @param {number} collectionId - Collection ID
   * @param {Object} guestData - Guest contact data
   * @param {string} guestData.name - Guest name (optional)
   * @param {string} guestData.phone - Guest phone (optional)
   * @param {string} guestData.email - Guest email (optional)
   * @param {string} guestData.contactMethod - Contact method ("phone"|"email"|"telegram"|"custom")
   * @param {string} guestData.contactInfo - Free-form contact info
   * @param {Object} deliveryData - Delivery information
   */
  async createGuestOrder(sessionId, collectionId, guestData, deliveryData) {
    // Validate sessionId
    if (!sessionId) {
      throw new ValidationError("sessionId is required");
    }

    // Validate guest contact data
    if (!guestData || !guestData.contactMethod) {
      throw new ValidationError("Guest contact method is required");
    }

    // Ensure at least one contact method is provided
    const hasContact =
      guestData.phone ||
      guestData.email ||
      guestData.contactInfo ||
      guestData.telegram;

    if (!hasContact) {
      throw new ValidationError("At least one contact method must be provided");
    }

    // Get guest cart items
    const cartItems = await this.orderRepo.prisma.cartItem.findMany({
      where: {
        sessionId,
        collectionId,
        isActive: true,
      },
      include: { product: true },
    });

    if (!cartItems.length) {
      throw new BusinessLogicError("Cart is empty", "CART_EMPTY");
    }

    // Validate collection is active
    const collection = await this.collectionRepo.findByIdOrFail(collectionId);
    if (collection.status !== COLLECTION_STATUS.ACTIVE) {
      throw new BusinessLogicError(
        "Collection is not active",
        "COLLECTION_NOT_ACTIVE"
      );
    }

    // Prepare and validate order items
    const { items, total } = await this._prepareOrderItems(
      cartItems,
      collectionId
    );

    // Calculate delivery cost
    const deliveryCost = this._calculateDeliveryCost(
      deliveryData.deliveryType,
      total
    );
    const finalTotal = total.add(dec(deliveryCost));

    // Create order in transaction
    const order = await this.orderRepo.prisma.$transaction(async (tx) => {
      // Create order without orderNumber first
      const createdOrder = await tx.order.create({
        data: {
          userId: null, // Guest order
          sessionId,
          collectionId,
          status: "SUBMITTED",
          totalKopecks: finalTotal.toNumber(),
          deliveryType: deliveryData.deliveryType || "PICKUP",
          deliveryAddress: deliveryData.deliveryAddress || null,
          deliveryCost,
          paymentMethod: deliveryData.paymentMethod || "development",
          // Guest data
          isGuestOrder: true,
          guestName: guestData.name || null,
          guestPhone: guestData.phone || null,
          guestEmail: guestData.email || null,
          guestContactMethod: guestData.contactMethod,
          guestContactInfo: guestData.contactInfo || null,
        },
      });

      // Generate and update order number based on order ID
      const orderNumber = this._generateOrderNumber(createdOrder.id);
      await tx.order.update({
        where: { id: createdOrder.id },
        data: { orderNumber },
      });
      createdOrder.orderNumber = orderNumber;

      // Create order items and update stock
      for (const item of items) {
        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: item.productId,
            titleSnapshot: item.titleSnapshot,
            unitLabelSnapshot: item.unitLabelSnapshot,
            quantityDecimal: item.quantityDecimal,
            unitPriceKopecks: item.unitPriceKopecks,
            subtotalKopecks: item.subtotalKopecks,
            imagePathSnapshot: item.imagePathSnapshot,
          },
        });

        // Decrease stock
        await this.inventoryService.decreaseStock(
          tx,
          item.productId,
          item.quantityDecimal
        );
      }

      // Clear guest cart
      await tx.cartItem.deleteMany({
        where: { sessionId, collectionId },
      });

      return createdOrder;
    });

    return order;
  }

  /**
   * Get guest order by sessionId and orderId
   */
  async getGuestOrderDetails(sessionId, orderId) {
    if (!sessionId) {
      throw new ValidationError("sessionId is required");
    }

    const order = await this.orderRepo.findWithDetails(orderId);

    if (!order) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    // Check ownership by sessionId
    if (order.sessionId !== sessionId || !order.isGuestOrder) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    return order;
  }

  /**
   * Get all orders by sessionId (for guest)
   */
  async getGuestOrders(sessionId) {
    if (!sessionId) {
      return [];
    }

    return this.orderRepo.findMany(
      {
        sessionId,
        isGuestOrder: true,
      },
      {
        include: {
          collection: { select: { id: true, title: true } },
          items: {
            include: {
              product: {
                select: { id: true, title: true, imagePath: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }
    );
  }

  /**
   * Migrate guest orders to user (after registration/login)
   */
  async migrateGuestOrdersToUser(sessionId, userId) {
    if (!sessionId || !userId) {
      throw new ValidationError("sessionId and userId are required");
    }

    const result = await this.orderRepo.prisma.order.updateMany({
      where: {
        sessionId,
        isGuestOrder: true,
        userId: null,
      },
      data: {
        userId,
        isGuestOrder: false,
        sessionId: null, // Clear sessionId after migration
      },
    });

    return { migrated: result.count };
  }
}
