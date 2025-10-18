import { Container } from "../core/di/Container.js";

// Repositories
import { UserRepository } from "../repositories/UserRepository.js";
import { ProductRepository } from "../repositories/ProductRepository.js";
import { OrderRepository } from "../repositories/OrderRepository.js";
import { CartRepository } from "../repositories/CartRepository.js";
import { CollectionRepository } from "../repositories/CollectionRepository.js";
import { RefreshTokenRepository } from "../repositories/RefreshTokenRepository.js";
import { FavoriteRepository } from "../repositories/FavoriteRepository.js";
import { NotificationRepository } from "../repositories/NotificationRepository.js";
import { ReviewRepository } from "../repositories/ReviewRepository.js";
import { ProductFeedbackRepository } from "../repositories/ProductFeedbackRepository.js";
import { RecipeRepository } from "../repositories/RecipeRepository.js";
import { TelegramAdminRepository } from "../repositories/TelegramAdminRepository.js";
import { OAuthRepository } from "../repositories/OAuthRepository.js";

// Services
import { OrderService } from "../services/OrderService.js";
import { CartService } from "../services/CartService.js";
import { GuestCartService } from "../services/GuestCartService.js";
import { ProductService } from "../services/ProductService.js";
import { CollectionService } from "../services/CollectionService.js";
import { PricingService } from "../services/PricingService.js";
import { InventoryService } from "../services/InventoryService.js";
import { AuthService } from "../services/AuthService.js";
import { MailerService } from "../services/MailerService.js";
import { FavoriteService } from "../services/FavoriteService.js";
import { ProfileService } from "../services/ProfileService.js";
// РЕФЕРАЛЬНАЯ ПРОГРАММА ЗАКОММЕНТИРОВАНА - НЕ РЕАЛИЗУЕМ
// import { ReferralService } from "../services/ReferralService.js";
import { NotificationService } from "../services/NotificationService.js";
import { TelegramBotService } from "../services/TelegramBotService.js";
import { ReviewService } from "../services/ReviewService.js";
import { ProductFeedbackService } from "../services/ProductFeedbackService.js";
import { RecipeService } from "../services/RecipeService.js";
import { TelegramAdminService } from "../services/TelegramAdminService.js";
import { AnalyticsService } from "../services/AnalyticsService.js";
import { BroadcastService } from "../services/BroadcastService.js";
import { OAuthService } from "../services/OAuthService.js";

// Controllers
import { OrderController } from "../controllers/OrderController.js";
import { CartController } from "../controllers/CartController.js";
import { GuestCartController } from "../controllers/GuestCartController.js";
import { ProductController } from "../controllers/ProductController.js";
import { CollectionController } from "../controllers/CollectionController.js";
import { AuthController } from "../controllers/AuthController.js";
import { FavoriteController } from "../controllers/FavoriteController.js";
import { ProfileController } from "../controllers/ProfileController.js";
// РЕФЕРАЛЬНАЯ ПРОГРАММА ЗАКОММЕНТИРОВАНА - НЕ РЕАЛИЗУЕМ
// import { ReferralController } from "../controllers/ReferralController.js";
import { NotificationController } from "../controllers/NotificationController.js";
import { ReviewController } from "../controllers/ReviewController.js";
import { ProductFeedbackController } from "../controllers/ProductFeedbackController.js";
import { RecipeController } from "../controllers/RecipeController.js";
import { TelegramAdminController } from "../controllers/TelegramAdminController.js";
import { AnalyticsController } from "../controllers/AnalyticsController.js";
import { BroadcastController } from "../controllers/BroadcastController.js";
import { PublicController } from "../controllers/PublicController.js";
import { OAuthController } from "../controllers/OAuthController.js";

/**
 * Configure dependency injection container
 */
export function configureContainer(prisma) {
  const container = new Container();

  // Register Prisma client
  container.registerValue("prisma", prisma);

  // Register Repositories
  container.register(
    "userRepository",
    (c) => new UserRepository(c.resolve("prisma"))
  );
  container.register(
    "productRepository",
    (c) => new ProductRepository(c.resolve("prisma"))
  );
  container.register(
    "orderRepository",
    (c) => new OrderRepository(c.resolve("prisma"))
  );
  container.register(
    "cartRepository",
    (c) => new CartRepository(c.resolve("prisma"))
  );
  container.register(
    "collectionRepository",
    (c) => new CollectionRepository(c.resolve("prisma"))
  );
  container.register(
    "refreshTokenRepository",
    (c) => new RefreshTokenRepository(c.resolve("prisma"))
  );
  container.register(
    "favoriteRepository",
    (c) => new FavoriteRepository(c.resolve("prisma"))
  );
  container.register(
    "notificationRepository",
    (c) => new NotificationRepository(c.resolve("prisma"))
  );
  container.register(
    "reviewRepository",
    (c) => new ReviewRepository(c.resolve("prisma"))
  );
  container.register(
    "productFeedbackRepository",
    (c) => new ProductFeedbackRepository(c.resolve("prisma"))
  );
  container.register(
    "recipeRepository",
    (c) => new RecipeRepository(c.resolve("prisma"))
  );
  container.register(
    "telegramAdminRepository",
    (c) => new TelegramAdminRepository(c.resolve("prisma"))
  );
  container.register(
    "oauthRepository",
    (c) => new OAuthRepository(c.resolve("prisma"))
  );

  // Register Services
  container.register("mailerService", () => new MailerService());
  container.register(
    "telegramBotService",
    (c) => new TelegramBotService(c.resolve("prisma"))
  );

  container.register(
    "pricingService",
    (c) =>
      new PricingService(
        c.resolve("productRepository"),
        c.resolve("collectionRepository")
      )
  );

  container.register(
    "inventoryService",
    (c) => new InventoryService(c.resolve("productRepository"))
  );

  container.register(
    "collectionService",
    (c) => new CollectionService(c.resolve("collectionRepository"))
  );

  container.register(
    "productService",
    (c) =>
      new ProductService(
        c.resolve("productRepository"),
        c.resolve("inventoryService"),
        c.resolve("collectionRepository"),
        c.resolve("telegramBotService"),
        c.resolve("prisma")
      )
  );

  container.register(
    "cartService",
    (c) =>
      new CartService(
        c.resolve("cartRepository"),
        c.resolve("productRepository"),
        c.resolve("collectionRepository"),
        c.resolve("pricingService")
      )
  );

  container.register(
    "guestCartService",
    (c) =>
      new GuestCartService(
        c.resolve("cartRepository"),
        c.resolve("productRepository"),
        c.resolve("pricingService"),
        c.resolve("prisma")
      )
  );

  container.register(
    "orderService",
    (c) =>
      new OrderService(
        c.resolve("orderRepository"),
        c.resolve("cartRepository"),
        c.resolve("productRepository"),
        c.resolve("collectionRepository"),
        c.resolve("pricingService"),
        c.resolve("inventoryService"),
        c.resolve("telegramBotService")
      )
  );

  container.register(
    "authService",
    (c) =>
      new AuthService(
        c.resolve("userRepository"),
        c.resolve("refreshTokenRepository"),
        c.resolve("cartRepository"),
        c.resolve("favoriteRepository"),
        c.resolve("orderRepository"),
        c.resolve("mailerService"),
        c.resolve("guestCartService")
      )
  );

  container.register(
    "favoriteService",
    (c) =>
      new FavoriteService(
        c.resolve("favoriteRepository"),
        c.resolve("productRepository")
      )
  );

  container.register(
    "profileService",
    (c) =>
      new ProfileService(
        c.resolve("userRepository"),
        c.resolve("orderRepository")
      )
  );

  // РЕФЕРАЛЬНАЯ ПРОГРАММА ЗАКОММЕНТИРОВАНА - НЕ РЕАЛИЗУЕМ
  // container.register(
  //   "referralService",
  //   (c) => new ReferralService(c.resolve("userRepository"))
  // );

  container.register(
    "notificationService",
    (c) =>
      new NotificationService(
        c.resolve("notificationRepository"),
        c.resolve("userRepository")
      )
  );

  container.register(
    "reviewService",
    (c) =>
      new ReviewService(
        c.resolve("reviewRepository"),
        c.resolve("telegramBotService")
      )
  );

  container.register(
    "productFeedbackService",
    (c) => new ProductFeedbackService(c.resolve("productFeedbackRepository"))
  );

  container.register(
    "recipeService",
    (c) =>
      new RecipeService(
        c.resolve("recipeRepository"),
        c.resolve("telegramBotService")
      )
  );

  container.register(
    "telegramAdminService",
    (c) => new TelegramAdminService(c.resolve("telegramAdminRepository"))
  );

  container.register(
    "analyticsService",
    (c) => new AnalyticsService(c.resolve("prisma"))
  );

  container.register(
    "broadcastService",
    (c) => new BroadcastService(c.resolve("prisma"))
  );

  container.register(
    "oauthService",
    (c) =>
      new OAuthService(
        c.resolve("oauthRepository"),
        c.resolve("userRepository"),
        c.resolve("guestCartService"),
        c.resolve("orderService")
      )
  );

  // Register Controllers
  container.register(
    "orderController",
    (c) =>
      new OrderController(
        c.resolve("orderService"),
        c.resolve("collectionService")
      )
  );

  container.register(
    "cartController",
    (c) =>
      new CartController(
        c.resolve("cartService"),
        c.resolve("collectionService")
      )
  );

  container.register(
    "guestCartController",
    (c) =>
      new GuestCartController(
        c.resolve("guestCartService"),
        c.resolve("orderService")
      )
  );

  container.register(
    "productController",
    (c) =>
      new ProductController(
        c.resolve("productService"),
        c.resolve("collectionService")
      )
  );

  container.register(
    "collectionController",
    (c) => new CollectionController(c.resolve("collectionService"))
  );

  container.register(
    "authController",
    (c) => new AuthController(c.resolve("authService"))
  );

  container.register(
    "favoriteController",
    (c) => new FavoriteController(c.resolve("favoriteService"))
  );

  container.register(
    "profileController",
    (c) => new ProfileController(c.resolve("profileService"))
  );

  // РЕФЕРАЛЬНАЯ ПРОГРАММА ЗАКОММЕНТИРОВАНА - НЕ РЕАЛИЗУЕМ
  // container.register(
  //   "referralController",
  //   (c) => new ReferralController(c.resolve("referralService"))
  // );

  container.register(
    "notificationController",
    (c) => new NotificationController(c.resolve("notificationService"))
  );

  container.register(
    "reviewController",
    (c) => new ReviewController(c.resolve("reviewService"))
  );

  container.register(
    "productFeedbackController",
    (c) => new ProductFeedbackController(c.resolve("productFeedbackService"))
  );

  container.register(
    "recipeController",
    (c) => new RecipeController(c.resolve("recipeService"))
  );

  container.register(
    "telegramAdminController",
    (c) => new TelegramAdminController(c.resolve("telegramAdminService"))
  );

  container.register(
    "analyticsController",
    (c) => new AnalyticsController(c.resolve("analyticsService"))
  );

  container.register(
    "broadcastController",
    (c) => new BroadcastController(c.resolve("broadcastService"))
  );

  container.register("publicController", () => new PublicController());

  container.register(
    "oauthController",
    (c) => new OAuthController(c.resolve("oauthService"))
  );

  return container;
}
