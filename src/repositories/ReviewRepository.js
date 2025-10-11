import { BaseRepository } from "../core/base/BaseRepository.js";

/**
 * Repository for public reviews management
 */
export class ReviewRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "publicReview");
  }

  /**
   * Get reviews with pagination and sorting
   */
  async findWithPagination(
    page = 1,
    pageSize = 6,
    sort = "createdAt",
    direction = "desc"
  ) {
    const skip = (page - 1) * pageSize;

    const orderBy =
      sort === "rating" ? { rating: direction } : { createdAt: direction };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.publicReview.findMany({
        orderBy,
        skip,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              avatarPath: true,
            },
          },
          images: true,
        },
      }),
      this.prisma.publicReview.count(),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Create review with user info
   */
  async createReview(userId, data) {
    return this.prisma.publicReview.create({
      data: {
        userId,
        title: data.title || null,
        content: data.content,
        rating: data.rating,
      },
    });
  }

  /**
   * Get review with full details
   */
  async findByIdWithDetails(reviewId) {
    return this.prisma.publicReview.findUnique({
      where: { id: reviewId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            avatarPath: true,
          },
        },
        images: true,
      },
    });
  }

  /**
   * Add images to review
   */
  async addImages(reviewId, imagePaths) {
    if (!imagePaths || imagePaths.length === 0) return [];

    await this.prisma.publicReviewImage.createMany({
      data: imagePaths.map((imagePath) => ({
        reviewId,
        imagePath,
      })),
    });

    return this.prisma.publicReviewImage.findMany({
      where: { reviewId },
    });
  }
}
