import { Router } from "express";
import { asyncHandler } from "../../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";

/**
 * Create admin telegram routes (categories and settings)
 */
export function createAdminTelegramRoutes(container) {
  const router = Router();
  const telegramController = container.resolve("telegramAdminController");

  // All routes require auth and admin role
  router.use(requireAuth, requireAdmin);

  // Categories
  router.get("/categories", asyncHandler(telegramController.getCategories));
  router.post("/categories", asyncHandler(telegramController.createCategory));
  router.patch(
    "/categories/:id",
    asyncHandler(telegramController.updateCategory)
  );

  // Settings
  router.get(
    "/telegram-settings",
    asyncHandler(telegramController.getSettings)
  );
  router.put(
    "/telegram-settings/:key",
    asyncHandler(telegramController.updateSetting)
  );

  return router;
}
