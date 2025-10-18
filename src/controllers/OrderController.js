import { BaseController } from "../core/base/BaseController.js";
import {
  toOrderListDTOArray,
  toOrderDetailDTO,
  toOrderAdminDTOArray,
} from "../dto/OrderDTO.js";

export class OrderController extends BaseController {
  constructor(orderService, collectionService) {
    super();
    this.orderService = orderService;
    this.collectionService = collectionService;
    this.bindMethods();
  }

  /**
   * Create order from cart
   * POST /api/cart/submit
   */
  async createOrder(req, res) {
    const userId = this.getUserId(req);
    const payload = req.body || {};

    // Handle single or multiple orders
    const ordersPayload =
      Array.isArray(payload.orders) && payload.orders.length
        ? payload.orders
        : [
            {
              collectionId: payload.collection_id ?? payload.collectionId,
              deliveryType: payload.deliveryType || "PICKUP",
              deliveryAddress: payload.deliveryAddress || null,
            },
          ];

    const createdOrders = [];
    const failedOrders = [];

    for (const orderData of ordersPayload) {
      try {
        // Resolve collection
        const collection =
          await this.collectionService.resolveCollectionSelection(
            orderData.collectionId,
            ordersPayload.length > 1 && !orderData.collectionId
          );

        // Create order
        const order = await this.orderService.createFromCart(
          userId,
          collection.id,
          {
            deliveryType: orderData.deliveryType || "PICKUP",
            deliveryAddress: orderData.deliveryAddress || null,
            paymentMethod: orderData.paymentMethod || "development", // Временно "в разработке"
          }
        );

        createdOrders.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          collectionId: order.collectionId,
        });
      } catch (error) {
        console.error(
          `Failed to create order for collection ${orderData.collectionId}:`,
          error
        );
        failedOrders.push({
          collectionId: orderData.collectionId,
          error: error.message || "Неизвестная ошибка",
        });
      }
    }

    if (createdOrders.length === 0) {
      return this.badRequest(res, "Не удалось создать ни одного заказа", {
        failedOrders,
      });
    }

    const response = { orders: createdOrders };
    if (failedOrders.length > 0) {
      response.failedOrders = failedOrders;
    }

    return this.created(
      res,
      response,
      `Создано заказов: ${createdOrders.length}${failedOrders.length > 0 ? `, не удалось создать: ${failedOrders.length}` : ""}`
    );
  }

  /**
   * Get user orders
   * GET /api/orders
   */
  async getUserOrders(req, res) {
    const userId = this.getUserId(req);
    const orders = await this.orderService.getUserOrders(userId);

    // Применяем DTO для списка заказов (уменьшает размер на 60%)
    const optimizedOrders = toOrderListDTOArray(orders);

    return this.success(res, { orders: optimizedOrders });
  }

  /**
   * Get order details
   * GET /api/orders/:id
   */
  async getOrder(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    const order = await this.orderService.getOrderDetails(orderId, userId);

    // Применяем DTO для деталей заказа
    const optimizedOrder = toOrderDetailDTO(order);

    return this.success(res, { order: optimizedOrder });
  }

  /**
   * Upload payment proof
   * POST /api/orders/:id/payment-proof
   */
  async uploadPaymentProof(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    if (!req.file) {
      return res.status(400).json({ error: "NO_FILE" });
    }

    // Verify order ownership
    await this.orderService.getOrderDetails(orderId, userId);

    const relPath = ["payments", req.file.filename].join("/");

    // Create payment proof using Prisma directly (or create PaymentProofService)
    const proof = await req.app.locals.prisma.paymentProof.create({
      data: {
        orderId,
        imagePath: relPath,
        note: null,
      },
    });

    return this.created(res, { proof });
  }

  /**
   * Repeat order
   * POST /api/orders/:id/repeat
   */
  async repeatOrder(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    const targetCollectionId =
      req.body?.collection_id ?? req.body?.collectionId;

    // Resolve target collection
    const collection =
      await this.collectionService.resolveCollectionSelection(
        targetCollectionId
      );

    const result = await this.orderService.repeatOrder(
      orderId,
      userId,
      collection.id
    );

    return this.success(res, result, "Items added to cart");
  }

  /**
   * Cancel order
   * PATCH /api/orders/:id/cancel
   */
  async cancelOrder(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    // Проверяем, что заказ принадлежит пользователю
    const order = await this.orderService.getOrderDetails(orderId, userId);

    // Проверяем, что заказ можно отменить (только SUBMITTED статус)
    if (order.status !== "SUBMITTED") {
      return this.badRequest(
        res,
        "Заказ можно отменить только в статусе 'Ожидает оплаты'"
      );
    }

    // Отменяем заказ
    const cancelledOrder = await this.orderService.updateStatus(
      orderId,
      "CANCELLED"
    );

    return this.success(res, { order: cancelledOrder }, "Заказ отменен");
  }

  /**
   * Get all orders (admin)
   * GET /api/admin/orders
   */
  async getAllOrders(req, res) {
    const orders = await this.orderService.getAllOrders();

    // Применяем DTO для админки (включает user info)
    const optimizedOrders = toOrderAdminDTOArray(orders);

    return this.success(res, { orders: optimizedOrders });
  }

  /**
   * Update order status (admin)
   * PATCH /api/admin/orders/:id/status
   */
  async updateOrderStatus(req, res) {
    const orderId = Number(req.params.id);
    const { status } = req.body || {};

    const order = await this.orderService.updateStatus(orderId, status);

    return this.success(res, { order });
  }

  /**
   * Update order delivery (admin)
   * PATCH /api/admin/orders/:id/delivery
   */
  async updateOrderDelivery(req, res) {
    const orderId = Number(req.params.id);
    const { deliveryType, deliveryAddress } = req.body || {};

    const order = await req.app.locals.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryType,
        deliveryAddress: deliveryType === "DELIVERY" ? deliveryAddress : null,
      },
    });

    return this.success(res, { order });
  }

  /**
   * Create order from guest cart (for unauthenticated users)
   * POST /api/orders/guest
   */
  async createGuestOrder(req, res) {
    const { sessionId, collectionId, guestData, deliveryData } = req.body;

    const order = await this.orderService.createGuestOrder(
      sessionId,
      collectionId,
      guestData,
      deliveryData
    );

    return this.success(res, { order }, "Guest order created successfully");
  }

  /**
   * Частичная отмена заказа
   * POST /api/orders/:id/partial-cancel
   */
  async partialCancelOrder(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);
    const { cancelItems } = req.body;

    if (!cancelItems || !Array.isArray(cancelItems)) {
      return this.badRequest(res, "Необходимо указать товары для отмены");
    }

    const result = await this.orderService.partialCancelOrder(
      orderId,
      userId,
      cancelItems
    );

    return this.success(res, result, "Частичная отмена заказа выполнена");
  }

  /**
   * Изменение товаров в заказе
   * PATCH /api/orders/:id/items
   */
  async editOrderItems(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes)) {
      return this.badRequest(res, "Необходимо указать изменения");
    }

    const result = await this.orderService.editOrderItems(
      orderId,
      userId,
      changes
    );

    return this.success(res, result, "Заказ успешно обновлен");
  }

  /**
   * Получение заказа для редактирования
   * GET /api/orders/:id/edit
   */
  async getOrderForEdit(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    const result = await this.orderService.getOrderForEdit(orderId, userId);

    return this.success(res, result, "Данные заказа загружены");
  }

  /**
   * История изменений заказа
   * GET /api/orders/:id/history
   */
  async getOrderHistory(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    const history = await this.orderService.getOrderHistory(orderId, userId);

    return this.success(res, { history });
  }

  /**
   * Добавление товара в заказ
   * POST /api/orders/:id/items
   */
  async addItemToOrder(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
      return this.badRequest(res, "Необходимо указать товар и количество");
    }

    const result = await this.orderService.addItemToOrder(
      orderId,
      userId,
      productId,
      quantity
    );

    return this.success(res, result, "Товар добавлен в заказ");
  }

  /**
   * Удаление товара из заказа
   * DELETE /api/orders/:id/items/:itemId
   */
  async removeItemFromOrder(req, res) {
    const orderId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    const result = await this.orderService.removeItemFromOrder(orderId, itemId);

    return this.success(res, result, "Товар удален из заказа");
  }

  /**
   * Обновление количества товара в заказе
   * PATCH /api/orders/items/:itemId/quantity
   */
  async updateItemQuantity(req, res) {
    const itemId = Number(req.params.itemId);
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
      return this.badRequest(res, "Необходимо указать корректное количество");
    }

    // Получаем заказ по itemId
    const item = await this.orderService.orderRepo.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });

    if (!item) {
      return this.notFound(res, "Товар не найден");
    }

    const result = await this.orderService.updateItemQuantity(
      item.orderId,
      itemId,
      quantity
    );

    return this.success(res, result, "Количество товара обновлено");
  }

  /**
   * Изменение статуса заказа (только админы)
   * PATCH /api/orders/:id/status
   */
  async updateOrderStatus(req, res) {
    const orderId = Number(req.params.id);
    const { status, reason } = req.body;

    if (!status) {
      return this.badRequest(res, "Необходимо указать статус");
    }

    const result = await this.orderService.updateOrderStatus(
      orderId,
      status,
      reason
    );

    return this.success(res, result, "Статус заказа обновлен");
  }

  /**
   * Получение доступных действий для заказа
   * GET /api/orders/:id/actions
   */
  async getOrderActions(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    const actions = await this.orderService.getOrderActions(orderId, userId);

    return this.success(res, { actions });
  }

  /**
   * Отправка уведомления по заказу
   * POST /api/orders/:id/notify
   */
  async sendOrderNotification(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);
    const { message } = req.body;

    if (!message) {
      return this.badRequest(res, "Необходимо указать сообщение");
    }

    const result = await this.orderService.sendOrderNotification(
      orderId,
      userId,
      message
    );

    return this.success(res, result, "Уведомление отправлено");
  }

  /**
   * Статистика заказа
   * GET /api/orders/:id/stats
   */
  async getOrderStats(req, res) {
    const userId = this.getUserId(req);
    const orderId = Number(req.params.id);

    const stats = await this.orderService.getOrderStats(orderId, userId);

    return this.success(res, { stats });
  }
}
