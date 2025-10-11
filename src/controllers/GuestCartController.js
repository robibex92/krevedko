import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for guest cart operations (unauthenticated users)
 */
export class GuestCartController extends BaseController {
  constructor(guestCartService, orderService) {
    super();
    this.guestCartService = guestCartService;
    this.orderService = orderService;
  }

  /**
   * GET /api/guest/cart/:sessionId
   * Get guest cart by sessionId
   */
  getCart = async (req, res) => {
    const { sessionId } = req.params;
    const cart = await this.guestCartService.getGuestCart(sessionId);
    this.success(res, cart);
  };

  /**
   * GET /api/guest/cart/:sessionId/count
   * Get guest cart item count
   */
  getCartCount = async (req, res) => {
    const { sessionId } = req.params;
    const result = await this.guestCartService.getGuestCartCount(sessionId);
    this.success(res, result);
  };

  /**
   * POST /api/guest/cart/items
   * Add item to guest cart
   */
  addItem = async (req, res) => {
    const { sessionId, productId, collectionId, quantity } = req.body;
    const item = await this.guestCartService.addItemToGuestCart(
      sessionId,
      productId,
      collectionId,
      quantity
    );
    this.success(res, { item }, "Item added to cart");
  };

  /**
   * PATCH /api/guest/cart/items/:itemId
   * Update guest cart item quantity
   */
  updateItem = async (req, res) => {
    const { sessionId, quantity } = req.body;
    const { itemId } = req.params;
    const item = await this.guestCartService.updateGuestCartItem(
      sessionId,
      Number(itemId),
      quantity
    );
    this.success(res, { item }, "Item updated");
  };

  /**
   * DELETE /api/guest/cart/items/:itemId
   * Remove item from guest cart
   */
  removeItem = async (req, res) => {
    const { sessionId } = req.body;
    const { itemId } = req.params;
    await this.guestCartService.removeGuestCartItem(sessionId, Number(itemId));
    this.success(res, { removed: true }, "Item removed from cart");
  };

  /**
   * DELETE /api/guest/cart/:sessionId
   * Clear guest cart
   */
  clearCart = async (req, res) => {
    const { sessionId } = req.params;
    await this.guestCartService.clearGuestCart(sessionId);
    this.success(res, { cleared: true }, "Cart cleared");
  };

  /**
   * POST /api/guest/cart/merge
   * Merge guest cart into user cart (requires auth)
   */
  mergeCart = async (req, res) => {
    const { sessionId } = req.body;
    const userId = this.getUserId(req);

    const cartResult = await this.guestCartService.mergeGuestCartIntoUserCart(
      sessionId,
      userId
    );

    const ordersResult = await this.orderService.migrateGuestOrdersToUser(
      sessionId,
      userId
    );

    this.success(
      res,
      {
        cart: cartResult,
        orders: ordersResult,
      },
      "Guest data merged successfully"
    );
  };
}
