import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { paymentUpload } from "../../services/uploads.js";

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
    paymentUpload.single("image"),
    asyncHandler(orderController.uploadPaymentProof)
  );
  router.post(
    "/orders/:id/repeat",
    requireAuth,
    asyncHandler(orderController.repeatOrder)
  );

  return router;
}
