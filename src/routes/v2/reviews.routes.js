import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { reviewUpload } from "../../services/uploads.js";

/**
 * Create review routes
 */
export function createReviewRoutes(container) {
  const router = Router();
  const reviewController = container.resolve("reviewController");

  // Public routes
  router.get("/public/reviews", asyncHandler(reviewController.getReviews));

  // Protected routes
  router.post(
    "/public/reviews",
    requireAuth,
    reviewUploadBase.array("images", 5),
    asyncHandler(reviewController.createReview)
  );

  return router;
}
