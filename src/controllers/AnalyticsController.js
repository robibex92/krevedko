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
   * Query params:
   *  - days: number of days (e.g., 7, 30)
   *  - startDate: start date (ISO string)
   *  - endDate: end date (ISO string)
   */
  getAnalytics = async (req, res) => {
    const { days, startDate, endDate } = req.query || {};

    const analytics = await this.analyticsService.getAnalytics({
      days: days ? Number(days) : undefined,
      startDate,
      endDate,
    });

    this.success(res, analytics);
  };
}
