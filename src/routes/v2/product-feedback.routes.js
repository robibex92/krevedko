import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

/**
 * Create product feedback routes (reviews and comments)
 */
export function createProductFeedbackRoutes(container) {
  const router = Router();
  const feedbackController = container.resolve("productFeedbackController");

  // Reviews
  router.get(
    "/products/:id/reviews",
    asyncHandler(feedbackController.getProductReviews)
  );

  router.post(
    "/products/:id/reviews",
    requireAuth,
    asyncHandler(feedbackController.upsertProductReview)
  );

  router.delete(
    "/products/:id/reviews",
    requireAuth,
    asyncHandler(feedbackController.deleteProductReview)
  );

  // Comments
  router.get(
    "/products/:id/comments",
    asyncHandler(feedbackController.getProductComments)
  );

  router.post(
    "/products/:id/comments",
    requireAuth,
    asyncHandler(feedbackController.createProductComment)
  );

  router.delete(
    "/comments/:id",
    requireAuth,
    asyncHandler(feedbackController.deleteComment)
  );

  return router;
}
