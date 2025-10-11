import { BaseController } from "../core/base/BaseController.js";
import { validateRequired } from "../core/validators/index.js";
import { getCached, setCache } from "../services/cache.js";

/**
 * Controller for favorites endpoints
 */
export class FavoriteController extends BaseController {
  constructor(favoriteService) {
    super();
    this.favoriteService = favoriteService;
  }

  /**
   * GET /api/favorites
   * Get user's favorite products
   */
  getFavorites = async (req, res) => {
    const userId = this.getUserId(req);

    // Check cache
    const cacheKey = `favorites:${userId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return this.success(res, { products: cached });
    }

    const products = await this.favoriteService.getUserFavorites(userId);

    // Set cache
    try {
      setCache(cacheKey, products);
    } catch (error) {
      // Ignore cache errors
    }

    this.success(res, { products });
  };

  /**
   * POST /api/favorites
   * Add product to favorites
   */
  addFavorite = async (req, res) => {
    const userId = this.getUserId(req);
    const { product_id } = req.body || {};

    const productId = Number(product_id);
    validateRequired({ product_id: productId });

    const favorite = await this.favoriteService.addToFavorites(
      userId,
      productId
    );

    this.created(res, { favorite });
  };

  /**
   * DELETE /api/favorites/:productId
   * Remove product from favorites
   */
  removeFavorite = async (req, res) => {
    const userId = this.getUserId(req);
    const productId = Number(req.params.productId);

    const result = await this.favoriteService.removeFromFavorites(
      userId,
      productId
    );

    this.success(res, result);
  };
}
