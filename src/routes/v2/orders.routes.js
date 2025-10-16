import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { paymentUploadBase } from "../../services/uploads.js";

export function createOrderRoutes(container) {
  const router = Router();
  const orderController = container.resolve("orderController");

  // User endpoints
  router.post(
    "/cart/submit",
    requireAuth,
    asyncHandler(orderController.createOrder)
  );
  router.get(
    "/orders",
    requireAuth,
    asyncHandler(orderController.getUserOrders)
  );
  router.get(
    "/orders/:id",
    requireAuth,
    asyncHandler(orderController.getOrder)
  );
  router.post(
    "/orders/:id/payment-proof",
    requireAuth,
    paymentUploadBase.single("image"),
    asyncHandler(orderController.uploadPaymentProof)
  );
  router.post(
    "/orders/:id/repeat",
    requireAuth,
    asyncHandler(orderController.repeatOrder)
  );
  router.patch(
    "/orders/:id/cancel",
    requireAuth,
    asyncHandler(orderController.cancelOrder)
  );

  // Order management endpoints
  router.get(
    "/orders/:id/edit",
    requireAuth,
    asyncHandler(orderController.getOrderForEdit)
  );
  router.patch(
    "/orders/:id/items",
    requireAuth,
    asyncHandler(orderController.editOrderItems)
  );
  router.post(
    "/orders/:id/partial-cancel",
    requireAuth,
    asyncHandler(orderController.partialCancelOrder)
  );

  // Guest order endpoint (no auth required)
  router.post("/orders/guest", asyncHandler(orderController.createGuestOrder));

  return router;
}
