import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  softValidationRegister,
  softValidationLogin,
  softValidationProfile,
} from "../../middleware/softValidation.js";

/**
 * Create auth routes
 */
export function createAuthRoutes(container) {
  const router = Router();
  const authController = container.resolve("authController");

  // Public routes
  router.post(
    "/register",
    softValidationRegister,
    asyncHandler(authController.register)
  );
  router.post(
    "/login",
    softValidationLogin,
    asyncHandler(authController.login)
  );
  router.post("/logout", asyncHandler(authController.logout));
  router.get("/me", asyncHandler(authController.me));
  router.post("/refresh", asyncHandler(authController.refresh));

  // Password reset
  router.post("/password/forgot", asyncHandler(authController.forgotPassword));
  router.post("/password/reset", asyncHandler(authController.resetPassword));

  // Email verification
  router.get("/verify", asyncHandler(authController.verifyEmail));
  router.post(
    "/verify/resend",
    requireAuth,
    asyncHandler(authController.resendVerification)
  );
  router.post("/email", requireAuth, asyncHandler(authController.updateEmail));

  // Telegram auth
  router.post("/telegram/verify", asyncHandler(authController.telegramVerify));
  router.post(
    "/telegram/link",
    requireAuth,
    asyncHandler(authController.telegramLink)
  );
  router.post(
    "/telegram/unlink",
    requireAuth,
    asyncHandler(authController.telegramUnlink)
  );

  // Protected routes
  router.post(
    "/logout-all",
    requireAuth,
    asyncHandler(authController.logoutAll)
  );

  return router;
}
