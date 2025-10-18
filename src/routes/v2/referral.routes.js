// РЕФЕРАЛЬНАЯ ПРОГРАММА ЗАКОММЕНТИРОВАНА - НЕ РЕАЛИЗУЕМ
// import { Router } from "express";
// import { asyncHandler } from "../../core/middleware/asyncHandler.js";
// import { requireAuth } from "../../middleware/auth.js";

// /**
//  * Create referral routes
//  */
// export function createReferralRoutes(container) {
//   const router = Router();
//   const referralController = container.resolve("referralController");

//   // Protected routes
//   router.get(
//     "/referral/info",
//     requireAuth,
//     asyncHandler(referralController.getReferralInfo)
//   );

//   router.get(
//     "/referral/stats",
//     requireAuth,
//     asyncHandler(referralController.getReferralStats)
//   );

//   // Public route (for anonymous users to apply referral code before registration)
//   router.post(
//     "/referral/use",
//     asyncHandler(referralController.useReferralCode)
//   );

//   return router;
// }
