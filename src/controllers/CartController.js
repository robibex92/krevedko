import { BaseController } from "../core/base/BaseController.js";
import { ValidationError } from "../core/errors/AppError.js";

export class CartController extends BaseController {
  constructor(cartService, collectionService) {
    super();
    this.cartService = cartService;
    this.collectionService = collectionService;
    this.bindMethods();
  }

  /**
   * Get user cart
   * GET /api/cart
   */
  async getCart(req, res) {
    const userId = this.getUserId(req);
    const collectionIdParam = req.query.collection_id;

    let collectionIds = null;
    if (collectionIdParam) {
      collectionIds = String(collectionIdParam)
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v));
    }

    const cart = await this.cartService.getUserCart(userId, collectionIds);

    return this.success(res, cart);
  }

  /**
   * Add item to cart
   * POST /api/cart/items
   */
  async addItem(req, res) {
    const userId = this.getUserId(req);
    const { product_id, quantity, collection_id } = req.body || {};

    // Validate required fields
    if (!product_id) {
      throw new ValidationError("product_id is required");
    }
    if (!quantity) {
      throw new ValidationError("quantity is required");
    }

    const productId = Number(product_id);
    if (isNaN(productId) || productId <= 0) {
      throw new ValidationError("product_id must be a valid positive number");
    }

    // Resolve collection
    const collection = await this.collectionService.resolveCollectionSelection(
      collection_id ? Number(collection_id) : undefined
    );

    const item = await this.cartService.addItem(
      userId,
      productId,
      quantity,
      collection.id
    );

    return this.created(res, { itemId: item.id });
  }

  /**
   * Update cart item
   * PATCH /api/cart/items/:id
   */
  async updateItem(req, res) {
    const userId = this.getUserId(req);
    const itemId = Number(req.params.id);
    const { quantity } = req.body || {};

    await this.cartService.updateItemQuantity(itemId, userId, quantity);

    return this.success(res, { ok: true });
  }

  /**
   * Remove cart item
   * DELETE /api/cart/items/:id
   */
  async removeItem(req, res) {
    const userId = this.getUserId(req);
    const itemId = Number(req.params.id);

    await this.cartService.removeItem(itemId, userId);

    return this.success(res, { ok: true });
  }

  /**
   * Get cart count
   * GET /api/cart/count
   */
  async getCartCount(req, res) {
    const userId = this.getUserId(req);

    const activeCollections =
      await this.collectionService.getActiveCollections();
    const collectionIds = activeCollections.map((c) => c.id);

    const count = await this.cartService.getCartCount(userId, collectionIds);

    return this.success(res, { count });
  }

  /**
   * Check if user has saved cart
   * GET /api/cart/saved
   */
  async hasSavedCart(req, res) {
    const userId = this.getUserId(req);
    const saved = await this.cartService.hasSavedCart(userId);

    return this.success(res, { saved });
  }
}
