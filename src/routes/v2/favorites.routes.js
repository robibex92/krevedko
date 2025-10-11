import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

/**
 * Create favorites routes
 */
export function createFavoriteRoutes(container) {
  const router = Router();
  const favoriteController = container.resolve("favoriteController");

  // All routes require authentication
  router.get(
    "/favorites",
    requireAuth,
    asyncHandler(favoriteController.getFavorites)
  );

  router.post(
    "/favorites",
    requireAuth,
    asyncHandler(favoriteController.addFavorite)
  );

  router.delete(
    "/favorites/:productId",
    requireAuth,
    asyncHandler(favoriteController.removeFavorite)
  );

  return router;
}
