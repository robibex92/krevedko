import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

export function createCartRoutes(container) {
  const router = Router();
  const cartController = container.resolve("cartController");

  router.get("/cart", requireAuth, asyncHandler(cartController.getCart));
  router.post("/cart/items", requireAuth, asyncHandler(cartController.addItem));
  router.patch(
    "/cart/items/:id",
    requireAuth,
    asyncHandler(cartController.updateItem)
  );
  router.delete(
    "/cart/items/:id",
    requireAuth,
    asyncHandler(cartController.removeItem)
  );
  router.get(
    "/cart/count",
    requireAuth,
    asyncHandler(cartController.getCartCount)
  );
  router.get(
    "/cart/saved",
    requireAuth,
    asyncHandler(cartController.hasSavedCart)
  );

  return router;
}
