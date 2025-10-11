import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../core/errors/AppError.js";

const VALID_RATINGS = [1, 2, 3, 4, 5];

/**
 * Service for product reviews and comments
 */
export class ProductFeedbackService {
  constructor(productFeedbackRepository) {
    this.feedbackRepo = productFeedbackRepository;
  }

  // ----------------------
  // Reviews
  // ----------------------

  /**
   * Get reviews for a product
   */
  async getProductReviews(productId) {
    const reviews = await this.feedbackRepo.findReviewsByProduct(productId);
    return { reviews };
  }

  /**
   * Create or update review
   */
  async upsertProductReview(userId, productId, data) {
    const { rating, comment } = data;

    // Validation
    const ratingValue = Number(rating);
    if (!VALID_RATINGS.includes(ratingValue)) {
      throw new ValidationError("Invalid rating", "INVALID_RATING");
    }

    const review = await this.feedbackRepo.upsertReview(
      userId,
      productId,
      ratingValue,
      comment || null
    );

    return { review };
  }

  /**
   * Delete user's review
   */
  async deleteProductReview(userId, productId) {
    await this.feedbackRepo.deleteUserReview(userId, productId);
    return { ok: true };
  }

  // ----------------------
  // Comments
  // ----------------------

  /**
   * Get comments for a product
   */
  async getProductComments(productId) {
    const comments = await this.feedbackRepo.findCommentsByProduct(productId);
    return { comments };
  }

  /**
   * Create comment
   */
  async createProductComment(userId, productId, content) {
    // Validation
    if (!content || content.trim().length === 0) {
      throw new ValidationError("Content is required", "CONTENT_REQUIRED");
    }

    const comment = await this.feedbackRepo.createComment(
      userId,
      productId,
      content
    );

    return { comment };
  }

  /**
   * Delete comment
   */
  async deleteComment(commentId, userId, userRole) {
    const comment = await this.feedbackRepo.findCommentById(commentId);

    if (!comment) {
      throw new NotFoundError("Comment not found", "COMMENT_NOT_FOUND");
    }

    // Check permissions: owner or admin
    if (comment.userId !== userId && userRole !== "ADMIN") {
      throw new ForbiddenError(
        "You don't have permission to delete this comment",
        "FORBIDDEN"
      );
    }

    await this.feedbackRepo.deleteComment(commentId);

    return { ok: true };
  }
}
