import { ValidationError } from "../core/errors/AppError.js";
import path from "path";

const VALID_RATINGS = [1, 2, 3, 4, 5];

/**
 * Service for public reviews management
 */
export class ReviewService {
  constructor(reviewRepository, telegramBotService = null) {
    this.reviewRepo = reviewRepository;
    this.telegramBotService = telegramBotService;
  }

  /**
   * Get reviews with pagination and sorting
   */
  async getReviews(options = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(20, Math.max(1, Number(options.pageSize) || 6));
    const sort = options.sort === "rating" ? "rating" : "createdAt";
    const direction = options.order === "asc" ? "asc" : "desc";

    const result = await this.reviewRepo.findWithPagination(
      page,
      pageSize,
      sort,
      direction
    );

    // Format reviews
    const reviews = result.items.map((review) => ({
      id: review.id,
      title: review.title,
      content: review.content,
      rating: review.rating,
      createdAt: review.createdAt,
      user: review.user,
      images: review.images.map((img) => img.imagePath),
    }));

    return {
      reviews,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  /**
   * Create review with images
   */
  async createReview(userId, data, files = []) {
    const { title, content, rating } = data;

    // Validation
    const normalizedContent = content ? String(content).trim() : "";
    const normalizedTitle = title ? String(title).trim() : null;
    const ratingValue = Number(rating);

    if (!normalizedContent) {
      throw new ValidationError("Content is required", "CONTENT_REQUIRED");
    }

    if (!VALID_RATINGS.includes(ratingValue)) {
      throw new ValidationError("Invalid rating", "INVALID_RATING");
    }

    // Create review
    const review = await this.reviewRepo.createReview(userId, {
      title: normalizedTitle,
      content: normalizedContent,
      rating: ratingValue,
    });

    // Add images
    if (Array.isArray(files) && files.length > 0) {
      const imagePaths = files.map((file) =>
        path.join("reviews", file.filename).replace(/\\/g, "/")
      );
      await this.reviewRepo.addImages(review.id, imagePaths);
    }

    // Get full review with details
    const created = await this.reviewRepo.findByIdWithDetails(review.id);

    // Send to Telegram (if service is available)
    if (this.telegramBotService) {
      try {
        await this.telegramBotService.enqueueMessage("review", {
          reviewId: created.id,
        });
      } catch (error) {
        console.error("Failed to enqueue review message:", error);
        // Don't fail the request if telegram fails
      }
    }

    // Format response
    return {
      id: created.id,
      title: created.title,
      content: created.content,
      rating: created.rating,
      createdAt: created.createdAt,
      user: created.user,
      images: created.images.map((img) => img.imagePath),
    };
  }
}
