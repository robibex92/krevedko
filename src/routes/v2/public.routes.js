import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";

/**
 * Create public routes (health check, etc.)
 */
export function createPublicRoutes(container) {
  const router = Router();
  const publicController = container.resolve("publicController");

  // Health check
  router.get("/health", asyncHandler(publicController.getHealth));

  return router;
}
