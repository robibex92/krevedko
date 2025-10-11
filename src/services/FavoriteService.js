import { ValidationError, NotFoundError } from "../core/errors/AppError.js";
import { clearCache } from "./cache.js";

/**
 * Service for managing user favorites
 */
export class FavoriteService {
  constructor(favoriteRepository, productRepository) {
    this.favoriteRepo = favoriteRepository;
    this.productRepo = productRepository;
  }

  /**
   * Get user's favorite products
   */
  async getUserFavorites(userId) {
    const favorites = await this.favoriteRepo.findByUser(userId);

    // Transform products with availability info
    const products = favorites.map((fav) => ({
      id: fav.product.id,
      title: fav.product.title,
      description: fav.product.description,
      category: fav.product.category,
      imagePath: fav.product.imagePath,
      unitLabel: fav.product.unitLabel,
      stepDecimal: fav.product.stepDecimal.toString(),
      priceKopecks: fav.product.priceKopecks,
      stockQuantity: fav.product.stockQuantity.toString(),
      displayStockHint: fav.product.displayStockHint,
      isAvailable:
        fav.product.isActive && fav.product.displayStockHint !== "OUT",
    }));

    return products;
  }

  /**
   * Add product to favorites
   */
  async addToFavorites(userId, productId) {
    if (!productId || isNaN(productId)) {
      throw new ValidationError("PRODUCT_ID_REQUIRED");
    }

    // Check if product exists
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError("Product not found", "PRODUCT_NOT_FOUND");
    }

    // Add to favorites (upsert)
    const favorite = await this.favoriteRepo.addFavorite(userId, productId);

    // Clear cache
    try {
      clearCache(`favorites:${userId}`);
    } catch (error) {
      // Ignore cache errors
    }

    return favorite;
  }

  /**
   * Remove product from favorites
   */
  async removeFromFavorites(userId, productId) {
    if (!productId || isNaN(productId)) {
      throw new ValidationError("PRODUCT_ID_REQUIRED");
    }

    // Remove from favorites
    await this.favoriteRepo.removeFavorite(userId, productId);

    // Clear cache
    try {
      clearCache(`favorites:${userId}`);
    } catch (error) {
      // Ignore cache errors
    }

    return { ok: true };
  }

  /**
   * Check if product is in user's favorites
   */
  async isFavorite(userId, productId) {
    return await this.favoriteRepo.isFavorite(userId, productId);
  }

  /**
   * Get favorites count for user
   */
  async getFavoritesCount(userId) {
    return await this.favoriteRepo.countByUser(userId);
  }
}
