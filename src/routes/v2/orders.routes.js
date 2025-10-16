import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { paymentUploadBase } from "../../services/uploads.js";
import { rateLimiters } from "../../middleware/rateLimit.js";

export function createOrderRoutes(container) {
  const router = Router();
  const orderController = container.resolve("orderController");

  // User endpoints
  router.post(
    "/cart/submit",
    requireAuth,
    rateLimiters.orders, // Лимит для создания заказов
    asyncHandler(orderController.createOrder)
  );
  router.get(
    "/orders",
    requireAuth,
    rateLimiters.read, // Лимит для чтения
    asyncHandler(orderController.getUserOrders)
  );
  router.get(
    "/orders/:id",
    requireAuth,
    rateLimiters.read, // Лимит для чтения
    asyncHandler(orderController.getOrder)
  );
  router.post(
    "/orders/:id/payment-proof",
    requireAuth,
    rateLimiters.write, // Лимит для загрузки файлов
    paymentUploadBase.single("image"),
    asyncHandler(orderController.uploadPaymentProof)
  );
  router.post(
    "/orders/:id/repeat",
    requireAuth,
    rateLimiters.orders, // Лимит для создания заказов
    asyncHandler(orderController.repeatOrder)
  );
  router.patch(
    "/orders/:id/cancel",
    requireAuth,
    rateLimiters.write, // Лимит для изменения
    asyncHandler(orderController.cancelOrder)
  );

  // Order management endpoints (редактирование)
  router.get(
    "/orders/:id/edit",
    requireAuth,
    rateLimiters.read, // Лимит для чтения
    asyncHandler(orderController.getOrderForEdit)
  );
  router.patch(
    "/orders/:id/items",
    requireAuth,
    rateLimiters.orderEdit, // Отдельный лимит для редактирования
    asyncHandler(orderController.editOrderItems)
  );
  router.post(
    "/orders/:id/partial-cancel",
    requireAuth,
    rateLimiters.orderEdit, // Отдельный лимит для редактирования
    asyncHandler(orderController.partialCancelOrder)
  );

  // Guest order endpoint (no auth required)
  router.post("/orders/guest", asyncHandler(orderController.createGuestOrder));

  // Тестовый маршрут для отладки
  router.get("/orders/test", (req, res) => {
    res.json({ message: "Orders routes are working!", timestamp: new Date().toISOString() });
  });

  return router;
}
