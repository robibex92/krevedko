import { Router } from "express";
import { asyncHandler } from "../../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { recipesUpload } from "../../../services/uploads.js";

/**
 * Create admin recipe routes
 */
export function createAdminRecipeRoutes(container) {
  const router = Router();
  const recipeController = container.resolve("recipeController");

  // All routes require auth and admin role
  router.use(requireAuth, requireAdmin);

  // Get all recipes
  router.get("/recipes", asyncHandler(recipeController.getAllRecipes));

  // Get recipe by ID
  router.get("/recipes/:id", asyncHandler(recipeController.getRecipeById));

  // Create recipe
  router.post("/recipes", asyncHandler(recipeController.createRecipe));

  // Update recipe
  router.patch("/recipes/:id", asyncHandler(recipeController.updateRecipe));

  // Delete recipe
  router.delete("/recipes/:id", asyncHandler(recipeController.deleteRecipe));

  // Upload media
  router.post(
    "/recipes/upload",
    recipesUpload.array("media", 10),
    asyncHandler(recipeController.uploadMedia)
  );

  return router;
}
