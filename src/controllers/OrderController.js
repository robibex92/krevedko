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

    for (const orderData of ordersPayload) {
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
    }

    return this.created(
      res,
      { orders: createdOrders },
      "Order created successfully"
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
    const collection = await this.collectionService.resolveCollectionSelection(
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
}
