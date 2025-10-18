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
    inventoryService,
    telegramBotService
  ) {
    this.orderRepo = orderRepository;
    this.cartRepo = cartRepository;
    this.productRepo = productRepository;
    this.collectionRepo = collectionRepository;
    this.pricingService = pricingService;
    this.inventoryService = inventoryService;
    this.telegramBotService = telegramBotService;
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

    // Send notification to admin via Telegram
    if (this.telegramBotService) {
      try {
        await this.telegramBotService.enqueueMessage("order_notification", {
          orderId: order.id,
        });
      } catch (error) {
        console.error("Failed to enqueue order notification:", error);
      }
    }

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
    const allowedStatuses = [
      "SUBMITTED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];
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

    // Send notification to admin via Telegram
    if (this.telegramBotService) {
      try {
        await this.telegramBotService.enqueueMessage("order_notification", {
          orderId: order.id,
        });
      } catch (error) {
        console.error("Failed to enqueue guest order notification:", error);
      }
    }

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

  /**
   * Частичная отмена заказа
   * @param {number} orderId - ID заказа
   * @param {number} userId - ID пользователя
   * @param {Array} cancelItems - Массив товаров для отмены
   */
  async partialCancelOrder(orderId, userId, cancelItems) {
    // Проверяем, что заказ принадлежит пользователю
    const order = await this.orderRepo.findByIdOrFail(orderId);
    if (order.userId !== userId) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    // Проверяем, что заказ можно отменить
    if (order.status !== "SUBMITTED") {
      throw new BusinessLogicError(
        "Order cannot be cancelled",
        "ORDER_CANNOT_BE_CANCELLED"
      );
    }

    // Получаем товары заказа
    const orderItems = await this.orderRepo.prisma.orderItem.findMany({
      where: { orderId },
      include: { product: true },
    });

    // Обновляем количество товаров
    for (const cancelItem of cancelItems) {
      const orderItem = orderItems.find(
        (item) => item.productId === cancelItem.productId
      );
      if (!orderItem) {
        throw new BusinessLogicError(
          `Product ${cancelItem.productId} not found in order`,
          "PRODUCT_NOT_FOUND"
        );
      }

      const newQuantity = orderItem.quantityDecimal - cancelItem.quantity;
      if (newQuantity <= 0) {
        // Удаляем товар полностью
        await this.orderRepo.prisma.orderItem.delete({
          where: { id: orderItem.id },
        });
      } else {
        // Обновляем количество
        await this.orderRepo.prisma.orderItem.update({
          where: { id: orderItem.id },
          data: { quantityDecimal: newQuantity },
        });
      }
    }

    // Пересчитываем общую сумму заказа
    const updatedItems = await this.orderRepo.prisma.orderItem.findMany({
      where: { orderId },
      include: { product: true },
    });

    const totalKopecks = updatedItems.reduce((sum, item) => {
      return sum + item.quantityDecimal * item.product.priceKopecks;
    }, 0);

    // Обновляем заказ
    const updatedOrder = await this.orderRepo.prisma.order.update({
      where: { id: orderId },
      data: { totalKopecks },
      include: {
        items: { include: { product: true } },
        user: true,
        collection: true,
      },
    });

    return { order: updatedOrder };
  }

  /**
   * Изменение товаров в заказе
   * @param {number} orderId - ID заказа
   * @param {number} userId - ID пользователя
   * @param {Array} changes - Массив изменений
   */
  async editOrderItems(orderId, userId, changes) {
    // Проверяем, что заказ принадлежит пользователю
    const order = await this.orderRepo.findByIdOrFail(orderId);
    if (order.userId !== userId) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    // Проверяем, что заказ можно редактировать
    if (order.status !== "SUBMITTED") {
      throw new BusinessLogicError(
        "Order cannot be edited",
        "ORDER_CANNOT_BE_EDITED"
      );
    }

    // Обновляем товары
    for (const change of changes) {
      if (change.quantity <= 0) {
        // Удаляем товар
        await this.orderRepo.prisma.orderItem.deleteMany({
          where: { orderId, productId: change.productId },
        });
      } else {
        // Обновляем количество
        await this.orderRepo.prisma.orderItem.updateMany({
          where: { orderId, productId: change.productId },
          data: { quantityDecimal: change.quantity },
        });
      }
    }

    // Пересчитываем общую сумму заказа
    const updatedItems = await this.orderRepo.prisma.orderItem.findMany({
      where: { orderId },
      include: { product: true },
    });

    const totalKopecks = updatedItems.reduce((sum, item) => {
      return sum + item.quantityDecimal * item.product.priceKopecks;
    }, 0);

    // Обновляем заказ
    const updatedOrder = await this.orderRepo.prisma.order.update({
      where: { id: orderId },
      data: { totalKopecks },
      include: {
        items: { include: { product: true } },
        user: true,
        collection: true,
      },
    });

    return { order: updatedOrder };
  }

  /**
   * Получение заказа для редактирования
   * @param {number} orderId - ID заказа
   * @param {number} userId - ID пользователя
   */
  async getOrderForEdit(orderId, userId) {
    const order = await this.orderRepo.findByIdOrFail(orderId);
    if (order.userId !== userId) {
      throw new BusinessLogicError("Order not found", "ORDER_NOT_FOUND");
    }

    const orderWithItems = await this.orderRepo.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        user: true,
        collection: true,
      },
    });

    return { order: orderWithItems };
  }

  /**
   * Добавление товара в заказ (для админки)
   * @param {number} orderId - ID заказа
   * @param {number} adminUserId - ID администратора (для логирования)
   * @param {number} productId - ID товара
   * @param {number} quantity - Количество
   */
  async addItemToOrder(orderId, adminUserId, productId, quantity) {
    // Проверяем, что заказ существует
    const order = await this.orderRepo.findByIdOrFail(orderId);

    // Проверяем, что заказ можно редактировать
    if (order.status !== "SUBMITTED") {
      throw new BusinessLogicError(
        "Order cannot be edited",
        "ORDER_CANNOT_BE_EDITED"
      );
    }

    // Получаем товар
    const product = await this.productRepo.findByIdOrFail(productId);

    // Получаем ценообразование для этого периода
    const pricing = await this.pricingService.getProductPricing(
      productId,
      order.collectionId
    );

    if (!pricing.isAvailable) {
      throw new BusinessLogicError(
        "Product is not available",
        "PRODUCT_NOT_AVAILABLE"
      );
    }

    // Проверяем, что товар уже не добавлен в заказ
    const existingItem = await this.orderRepo.prisma.orderItem.findFirst({
      where: {
        orderId,
        productId,
      },
    });

    if (existingItem) {
      throw new BusinessLogicError(
        "Product already exists in order",
        "PRODUCT_ALREADY_EXISTS"
      );
    }

    // Создаем новый товар в заказе
    const newItem = await this.orderRepo.prisma.orderItem.create({
      data: {
        orderId,
        productId,
        titleSnapshot: product.title,
        unitLabelSnapshot: product.unitLabel,
        quantityDecimal: String(quantity),
        unitPriceKopecks: pricing.price,
        subtotalKopecks: Math.round(quantity * pricing.price),
        imagePathSnapshot: product.imagePath,
      },
    });

    // Пересчитываем общую сумму заказа
    const allItems = await this.orderRepo.prisma.orderItem.findMany({
      where: { orderId },
    });

    const newTotal = allItems.reduce((sum, item) => {
      return sum + item.subtotalKopecks;
    }, 0);

    // Обновляем заказ
    const updatedOrder = await this.orderRepo.prisma.order.update({
      where: { id: orderId },
      data: { totalKopecks: newTotal },
      include: {
        items: { include: { product: true } },
        user: true,
        collection: true,
      },
    });

    return { order: updatedOrder, newItem };
  }

  /**
   * Удаление товара из заказа (для админки)
   * @param {number} orderId - ID заказа
   * @param {number} itemId - ID товара в заказе
   */
  async removeItemFromOrder(orderId, itemId) {
    // Проверяем, что заказ существует
    const order = await this.orderRepo.findByIdOrFail(orderId);

    // Проверяем, что заказ можно редактировать
    if (order.status !== "SUBMITTED") {
      throw new BusinessLogicError(
        "Order cannot be edited",
        "ORDER_CANNOT_BE_EDITED"
      );
    }

    // Проверяем, что товар существует в заказе
    const item = await this.orderRepo.prisma.orderItem.findFirst({
      where: {
        id: itemId,
        orderId,
      },
    });

    if (!item) {
      throw new BusinessLogicError("Item not found in order", "ITEM_NOT_FOUND");
    }

    // Проверяем, что это не последний товар в заказе
    const allItems = await this.orderRepo.prisma.orderItem.findMany({
      where: { orderId },
    });

    if (allItems.length <= 1) {
      throw new BusinessLogicError(
        "Cannot delete last item from order",
        "CANNOT_DELETE_LAST_ITEM"
      );
    }

    // Удаляем товар
    await this.orderRepo.prisma.orderItem.delete({
      where: { id: itemId },
    });

    // Пересчитываем общую сумму заказа
    const remainingItems = await this.orderRepo.prisma.orderItem.findMany({
      where: { orderId },
    });

    const newTotal = remainingItems.reduce((sum, item) => {
      return sum + item.subtotalKopecks;
    }, 0);

    // Обновляем заказ
    const updatedOrder = await this.orderRepo.prisma.order.update({
      where: { id: orderId },
      data: { totalKopecks: newTotal },
      include: {
        items: { include: { product: true } },
        user: true,
        collection: true,
      },
    });

    return { order: updatedOrder };
  }

  /**
   * Обновление количества товара в заказе (для админки)
   * @param {number} orderId - ID заказа
   * @param {number} itemId - ID товара в заказе
   * @param {number} newQuantity - Новое количество
   */
  async updateItemQuantity(orderId, itemId, newQuantity) {
    // Проверяем, что заказ существует
    const order = await this.orderRepo.findByIdOrFail(orderId);

    // Проверяем, что заказ можно редактировать
    if (order.status !== "SUBMITTED") {
      throw new BusinessLogicError(
        "Order cannot be edited",
        "ORDER_CANNOT_BE_EDITED"
      );
    }

    // Проверяем, что товар существует в заказе
    const item = await this.orderRepo.prisma.orderItem.findFirst({
      where: {
        id: itemId,
        orderId,
      },
    });

    if (!item) {
      throw new BusinessLogicError("Item not found in order", "ITEM_NOT_FOUND");
    }

    // Обновляем количество и пересчитываем стоимость
    const newSubtotal = Math.round(newQuantity * item.unitPriceKopecks);

    await this.orderRepo.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantityDecimal: String(newQuantity),
        subtotalKopecks: newSubtotal,
      },
    });

    // Пересчитываем общую сумму заказа
    const allItems = await this.orderRepo.prisma.orderItem.findMany({
      where: { orderId },
    });

    const newTotal = allItems.reduce((sum, item) => {
      return sum + item.subtotalKopecks;
    }, 0);

    // Обновляем заказ
    const updatedOrder = await this.orderRepo.prisma.order.update({
      where: { id: orderId },
      data: { totalKopecks: newTotal },
      include: {
        items: { include: { product: true } },
        user: true,
        collection: true,
      },
    });

    return { order: updatedOrder };
  }

  /**
   * Add item to existing order (admin)
   */
  async addItemToOrder(orderId, itemData) {
    const { productId, quantity } = itemData;

    // Проверяем, что заказ существует
    const order = await this.orderRepo.findByIdOrFail(orderId);

    // Проверяем, что товар существует
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new BusinessLogicError("Product not found", "PRODUCT_NOT_FOUND");
    }

    // Проверяем, есть ли уже такой товар в заказе
    const existingItem = await this.prisma.orderItem.findFirst({
      where: {
        orderId: orderId,
        productId: productId,
      },
    });

    if (existingItem) {
      // Если товар уже есть, увеличиваем количество
      const updatedItem = await this.prisma.orderItem.update({
        where: { id: existingItem.id },
        data: {
          quantityDecimal: existingItem.quantityDecimal + quantity,
          subtotalKopecks:
            (existingItem.quantityDecimal + quantity) * product.priceKopecks,
        },
      });

      // Пересчитываем общую сумму заказа
      await this.recalculateOrderTotal(orderId);

      return { item: updatedItem, message: "Item quantity updated" };
    } else {
      // Если товара нет, создаем новый item
      const newItem = await this.prisma.orderItem.create({
        data: {
          orderId: orderId,
          productId: productId,
          quantityDecimal: quantity,
          unitPriceKopecks: product.priceKopecks,
          subtotalKopecks: quantity * product.priceKopecks,
          titleSnapshot: product.title,
          unitLabelSnapshot: product.unitLabel,
          imagePathSnapshot: product.imagePath,
        },
      });

      // Пересчитываем общую сумму заказа
      await this.recalculateOrderTotal(orderId);

      return { item: newItem, message: "Item added to order" };
    }
  }

  /**
   * Пересчитать общую сумму заказа
   */
  async recalculateOrderTotal(orderId) {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId: orderId },
    });

    const totalKopecks = items.reduce(
      (sum, item) => sum + (item.subtotalKopecks || 0),
      0
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { totalKopecks: totalKopecks },
    });
  }

  /**
   * Update order item quantity (admin)
   */
  async updateOrderItemQuantity(itemId, newQuantity) {
    // Проверяем, что item существует
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { product: true },
    });

    if (!item) {
      throw new BusinessLogicError(
        "Order item not found",
        "ORDER_ITEM_NOT_FOUND"
      );
    }

    // Обновляем количество и сумму
    const updatedItem = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantityDecimal: newQuantity,
        subtotalKopecks: newQuantity * item.product.priceKopecks,
      },
    });

    // Пересчитываем общую сумму заказа
    await this.recalculateOrderTotal(item.orderId);

    return { item: updatedItem, message: "Item quantity updated" };
  }

  /**
   * Delete order item (admin)
   */
  async deleteOrderItem(itemId) {
    // Проверяем, что item существует
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new BusinessLogicError(
        "Order item not found",
        "ORDER_ITEM_NOT_FOUND"
      );
    }

    const orderId = item.orderId;

    // Удаляем item
    await this.prisma.orderItem.delete({
      where: { id: itemId },
    });

    // Пересчитываем общую сумму заказа
    await this.recalculateOrderTotal(orderId);

    return { message: "Item deleted from order" };
  }
}
