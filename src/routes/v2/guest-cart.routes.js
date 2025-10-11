import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

/**
 * Guest cart routes (for unauthenticated users)
 */
export function createGuestCartRoutes(container) {
  const router = Router();
  const guestCartController = container.resolve("guestCartController");

  // GET /api/guest/cart/:sessionId
  router.get(
    "/guest/cart/:sessionId",
    asyncHandler(guestCartController.getCart)
  );

  // GET /api/guest/cart/:sessionId/count
  router.get(
    "/guest/cart/:sessionId/count",
    asyncHandler(guestCartController.getCartCount)
  );

  // POST /api/guest/cart/items
  router.post("/guest/cart/items", asyncHandler(guestCartController.addItem));

  // PATCH /api/guest/cart/items/:itemId
  router.patch(
    "/guest/cart/items/:itemId",
    asyncHandler(guestCartController.updateItem)
  );

  // DELETE /api/guest/cart/items/:itemId
  router.delete(
    "/guest/cart/items/:itemId",
    asyncHandler(guestCartController.removeItem)
  );

  // DELETE /api/guest/cart/:sessionId
  router.delete(
    "/guest/cart/:sessionId",
    asyncHandler(guestCartController.clearCart)
  );

  // POST /api/guest/cart/merge (requires auth)
  router.post(
    "/guest/cart/merge",
    requireAuth,
    asyncHandler(guestCartController.mergeCart)
  );

  return router;
}
