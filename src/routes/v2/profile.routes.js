import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { softValidationProfile } from "../../middleware/softValidation.js";

/**
 * Create profile routes
 */
export function createProfileRoutes(container) {
  const router = Router();
  const profileController = container.resolve("profileController");

  // All routes require authentication
  router.get(
    "/profile/me",
    requireAuth,
    asyncHandler(profileController.getProfile)
  );

  router.patch(
    "/profile",
    requireAuth,
    softValidationProfile,
    asyncHandler(profileController.updateProfile)
  );

  // Avatar upload needs special handling - multer middleware + async handler
  router.post(
    "/profile/avatar",
    requireAuth,
    profileController.uploadAvatar, // Multer middleware
    asyncHandler(profileController.saveAvatar) // Save handler
  );

  return router;
}
