import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for analytics endpoints
 */
export class AnalyticsController extends BaseController {
  constructor(analyticsService) {
    super();
    this.analyticsService = analyticsService;
  }

  /**
   * GET /api/admin/analytics
   * Get analytics data
   */
  getAnalytics = async (req, res) => {
    const { days = 7 } = req.query || {};

    const analytics = await this.analyticsService.getAnalytics(days);

    this.success(res, analytics);
  };
}
