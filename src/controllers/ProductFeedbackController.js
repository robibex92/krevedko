import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for product reviews and comments
 */
export class ProductFeedbackController extends BaseController {
  constructor(productFeedbackService) {
    super();
    this.feedbackService = productFeedbackService;
  }

  // ----------------------
  // Reviews
  // ----------------------

  /**
   * GET /api/products/:id/reviews
   * Get reviews for a product
   */
  getProductReviews = async (req, res) => {
    const productId = this.getIdParam(req);

    const result = await this.feedbackService.getProductReviews(productId);

    this.success(res, result);
  };

  /**
   * POST /api/products/:id/reviews
   * Create or update review for a product
   */
  upsertProductReview = async (req, res) => {
    const userId = this.getUserId(req);
    const productId = this.getIdParam(req);

    const result = await this.feedbackService.upsertProductReview(
      userId,
      productId,
      req.body || {}
    );

    this.created(res, result);
  };

  /**
   * DELETE /api/products/:id/reviews
   * Delete user's review for a product
   */
  deleteProductReview = async (req, res) => {
    const userId = this.getUserId(req);
    const productId = this.getIdParam(req);

    const result = await this.feedbackService.deleteProductReview(
      userId,
      productId
    );

    this.success(res, result);
  };

  // ----------------------
  // Comments
  // ----------------------

  /**
   * GET /api/products/:id/comments
   * Get comments for a product
   */
  getProductComments = async (req, res) => {
    const productId = this.getIdParam(req);

    const result = await this.feedbackService.getProductComments(productId);

    this.success(res, result);
  };

  /**
   * POST /api/products/:id/comments
   * Create comment for a product
   */
  createProductComment = async (req, res) => {
    const userId = this.getUserId(req);
    const productId = this.getIdParam(req);
    const { content } = req.body || {};

    const result = await this.feedbackService.createProductComment(
      userId,
      productId,
      content
    );

    this.created(res, result);
  };

  /**
   * DELETE /api/comments/:id
   * Delete comment (owner or admin)
   */
  deleteComment = async (req, res) => {
    const userId = this.getUserId(req);
    const userRole = req.user?.role || "USER";
    const commentId = this.getIdParam(req);

    const result = await this.feedbackService.deleteComment(
      commentId,
      userId,
      userRole
    );

    this.success(res, result);
  };
}
