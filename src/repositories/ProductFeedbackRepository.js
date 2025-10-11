import { BaseRepository } from "../core/base/BaseRepository.js";

/**
 * Repository for product reviews and comments
 */
export class ProductFeedbackRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "review"); // Base model for reviews
    this.prisma = prisma;
  }

  // ----------------------
  // Reviews
  // ----------------------

  /**
   * Get reviews for a product
   */
  async findReviewsByProduct(productId) {
    return this.prisma.review.findMany({
      where: { productId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramUsername: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Upsert review (create or update)
   */
  async upsertReview(userId, productId, rating, comment = null) {
    return this.prisma.review.upsert({
      where: {
        userId_productId: { userId, productId },
      },
      update: {
        rating: Number(rating),
        comment: comment || null,
      },
      create: {
        userId,
        productId,
        rating: Number(rating),
        comment: comment || null,
      },
    });
  }

  /**
   * Delete user's review for a product
   */
  async deleteUserReview(userId, productId) {
    return this.prisma.review.deleteMany({
      where: { userId, productId },
    });
  }

  // ----------------------
  // Comments
  // ----------------------

  /**
   * Get comments for a product
   */
  async findCommentsByProduct(productId) {
    return this.prisma.comment.findMany({
      where: { productId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegramUsername: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Create comment
   */
  async createComment(userId, productId, content) {
    return this.prisma.comment.create({
      data: {
        userId,
        productId,
        content: content.trim(),
      },
    });
  }

  /**
   * Find comment by ID
   */
  async findCommentById(commentId) {
    return this.prisma.comment.findUnique({
      where: { id: commentId },
    });
  }

  /**
   * Delete comment
   */
  async deleteComment(commentId) {
    return this.prisma.comment.delete({
      where: { id: commentId },
    });
  }
}
