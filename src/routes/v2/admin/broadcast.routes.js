import { Router } from "express";
import { asyncHandler } from "../../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";

/**
 * Create admin broadcast routes
 */
export function createAdminBroadcastRoutes(container) {
  const router = Router();
  const broadcastController = container.resolve("broadcastController");
  const analyticsController = container.resolve("analyticsController");

  // All routes require auth and admin role
  router.use(requireAuth, requireAdmin);

  // Broadcast preview (must be before /broadcast route)
  router.post(
    "/broadcast/preview",
    asyncHandler(broadcastController.previewBroadcast)
  );

  // Broadcast
  router.post("/broadcast", asyncHandler(broadcastController.broadcastMessage));

  // Analytics
  router.get("/analytics", asyncHandler(analyticsController.getAnalytics));

  return router;
}
