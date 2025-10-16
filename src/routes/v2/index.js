import { Router } from "express";
import { createAuthRoutes } from "./auth.routes.js";
import { createOrderRoutes } from "./orders.routes.js";
import { createCartRoutes } from "./cart.routes.js";
import { createGuestCartRoutes } from "./guest-cart.routes.js";
import { createCollectionRoutes } from "./collections.routes.js";
import { createFavoriteRoutes } from "./favorites.routes.js";
import { createProfileRoutes } from "./profile.routes.js";
import { createReferralRoutes } from "./referral.routes.js";
import { createNotificationRoutes } from "./notifications.routes.js";
import { createReviewRoutes } from "./reviews.routes.js";
import { createProductFeedbackRoutes } from "./product-feedback.routes.js";
import { createRecipeRoutes } from "./recipes.routes.js";
import { createAdminProductRoutes } from "./admin/products.routes.js";
import { createAdminCollectionRoutes } from "./admin/collections.routes.js";
import { createAdminOrderRoutes } from "./admin/orders.routes.js";
import { createAdminRecipeRoutes } from "./admin/recipes.routes.js";
import { createAdminTelegramRoutes } from "./admin/telegram.routes.js";
import { createAdminBroadcastRoutes } from "./admin/broadcast.routes.js";
import { createWatermarkRoutes } from "./watermark.routes.js";
import { createPublicRoutes } from "./public.routes.js";
import { createOrderAutoCompletionRoutes } from "./order-auto-completion.routes.js";
import { createAdminRoleManagementRoutes } from "./admin-role-management.routes.js";
import { createOrderManagementRoutes } from "./order-management.routes.js";

/**
 * Create all v2 routes with new architecture
 */
export function createV2Routes(container) {
  const router = Router();

  // Auth routes (mounted separately in server.v2.js at /api/auth)
  // We export it here so it can be mounted at the correct path

  // Public routes (health, etc.)
  router.use(createPublicRoutes(container));

  // Public/user routes
  router.use(createOrderRoutes(container));
  router.use(createCartRoutes(container));
  router.use(createGuestCartRoutes(container)); // Guest cart routes
  router.use(createCollectionRoutes(container));
  router.use(createFavoriteRoutes(container));
  router.use(createProfileRoutes(container));
  router.use(createReferralRoutes(container));
  router.use(createNotificationRoutes(container));
  router.use(createReviewRoutes(container));
  router.use(createProductFeedbackRoutes(container));
  router.use(createRecipeRoutes(container));

  // Admin routes
  router.use("/admin", createAdminProductRoutes(container));
  router.use("/admin", createAdminCollectionRoutes(container));
  router.use("/admin", createAdminOrderRoutes(container));
  router.use("/admin", createAdminRecipeRoutes(container));
  router.use("/admin", createAdminTelegramRoutes(container));
  router.use("/admin", createAdminBroadcastRoutes(container));
  router.use(
    "/admin/orders/auto-completion",
    createOrderAutoCompletionRoutes()
  );
  router.use("/admin/roles", createAdminRoleManagementRoutes());

  // Добавляем логирование для отладки
  console.log("🔧 Registering order management routes...");
  try {
    const orderManagementRoutes = createOrderManagementRoutes(container);
    router.use(orderManagementRoutes);
    console.log("✅ Order management routes registered successfully");
  } catch (error) {
    console.error("❌ Error registering order management routes:", error);
  }

  // Временный тестовый маршрут прямо здесь
  router.get("/test-direct", (req, res) => {
    res.json({ message: "Direct test route is working!" });
  });

  router.use(createWatermarkRoutes(container));

  return router;
}

/**
 * Export auth routes separately for mounting at /api/auth
 */
export { createAuthRoutes };
