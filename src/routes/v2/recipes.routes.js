import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";

/**
 * Create recipe routes (public)
 */
export function createRecipeRoutes(container) {
  const router = Router();
  const recipeController = container.resolve("recipeController");

  // Public routes
  router.get(
    "/public/recipes",
    asyncHandler(recipeController.getPublishedRecipes)
  );

  router.get(
    "/public/recipes/:slug",
    asyncHandler(recipeController.getRecipeBySlug)
  );

  return router;
}
