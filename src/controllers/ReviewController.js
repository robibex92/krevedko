import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for public reviews
 */
export class ReviewController extends BaseController {
  constructor(reviewService) {
    super();
    this.reviewService = reviewService;
  }

  /**
   * GET /api/public/reviews
   * Get reviews with pagination and sorting
   */
  getReviews = async (req, res) => {
    const options = {
      page: req.query.page,
      pageSize: req.query.pageSize,
      sort: req.query.sort,
      order: req.query.order,
    };

    const result = await this.reviewService.getReviews(options);

    this.success(res, result);
  };

  /**
   * POST /api/public/reviews
   * Create review with images
   * Note: Uses multer middleware for file upload
   */
  createReview = async (req, res) => {
    const userId = this.getUserId(req);
    const files = req.files || [];

    const review = await this.reviewService.createReview(
      userId,
      req.body || {},
      files
    );

    this.created(res, { review });
  };
}
