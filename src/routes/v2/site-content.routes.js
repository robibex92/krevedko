import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";

/**
 * Create site content routes
 */
export function createSiteContentRoutes(container) {
  const router = Router();
  const siteContentController = container.resolve("siteContentController");

  // Public routes (для получения контента)
  router.get(
    "/site-content",
    asyncHandler(siteContentController.getSiteContent)
  );

  // Admin routes (требуют авторизации и админских прав)
  router.use("/admin/site-content", requireAuth, requireAdmin);
  router.put(
    "/admin/site-content",
    asyncHandler(siteContentController.updateSiteContent)
  );
  router.get(
    "/admin/site-content/faq",
    asyncHandler(siteContentController.getFAQItems)
  );
  router.post(
    "/admin/site-content/faq",
    asyncHandler(siteContentController.createFAQItem)
  );
  router.put(
    "/admin/site-content/faq/reorder",
    asyncHandler(siteContentController.reorderFAQItems)
  );
  router.put(
    "/admin/site-content/faq/:id",
    asyncHandler(siteContentController.updateFAQItem)
  );
  router.delete(
    "/admin/site-content/faq/:id",
    asyncHandler(siteContentController.deleteFAQItem)
  );

  return router;
}
