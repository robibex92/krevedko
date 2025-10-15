import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import {
  processAllImages,
  processProductImages,
  processReviewImages,
  processRecipeImages,
} from "../../utils/processExistingImages.js";

/**
 * Watermark processing routes (admin only)
 */
export function createWatermarkRoutes(container) {
  const router = Router();

  // POST /api/admin/watermark/process-all
  router.post(
    "/admin/watermark/process-all",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      try {
        const results = await processAllImages();
        res.json({
          success: true,
          message: "All images processed successfully",
          results,
        });
      } catch (error) {
        console.error("Error processing all images:", error);
        res.status(500).json({
          success: false,
          error: "Failed to process images",
          message: error.message,
        });
      }
    })
  );

  // POST /api/admin/watermark/process-products
  router.post(
    "/admin/watermark/process-products",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      try {
        const results = await processProductImages();
        res.json({
          success: true,
          message: "Product images processed successfully",
          results,
        });
      } catch (error) {
        console.error("Error processing product images:", error);
        res.status(500).json({
          success: false,
          error: "Failed to process product images",
          message: error.message,
        });
      }
    })
  );

  // POST /api/admin/watermark/process-reviews
  router.post(
    "/admin/watermark/process-reviews",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      try {
        const results = await processReviewImages();
        res.json({
          success: true,
          message: "Review images processed successfully",
          results,
        });
      } catch (error) {
        console.error("Error processing review images:", error);
        res.status(500).json({
          success: false,
          error: "Failed to process review images",
          message: error.message,
        });
      }
    })
  );

  // POST /api/admin/watermark/process-recipes
  router.post(
    "/admin/watermark/process-recipes",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      try {
        const results = await processRecipeImages();
        res.json({
          success: true,
          message: "Recipe images processed successfully",
          results,
        });
      } catch (error) {
        console.error("Error processing recipe images:", error);
        res.status(500).json({
          success: false,
          error: "Failed to process recipe images",
          message: error.message,
        });
      }
    })
  );

  return router;
}
