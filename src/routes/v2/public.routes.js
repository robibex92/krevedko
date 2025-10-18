import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";

/**
 * Create public routes (health check, etc.)
 */
export function createPublicRoutes(container) {
  const router = Router();
  const publicController = container.resolve("publicController");
  const productController = container.resolve("productController");

  // Health check
  router.get("/health", asyncHandler(publicController.getHealth));

  // Public products (for admin order management)
  router.get(
    "/public/products",
    asyncHandler(productController.getAllProducts)
  );
  router.get(
    "/public/categories",
    asyncHandler(productController.getCategories)
  );

  return router;
}
