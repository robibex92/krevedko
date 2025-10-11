import { getAnalyticsData } from "./analytics.js";

/**
 * Service for analytics business logic
 */
export class AnalyticsService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Get analytics data for specified period
   * @param {Object} options - Analytics options
   * @param {number} options.days - Number of days back from now
   * @param {string} options.startDate - Start date (ISO string)
   * @param {string} options.endDate - End date (ISO string)
   */
  async getAnalytics(options = {}) {
    let startDate, endDate;

    // If specific dates are provided, use them
    if (options.startDate && options.endDate) {
      startDate = new Date(options.startDate);
      endDate = new Date(options.endDate);

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format");
      }

      // Ensure endDate is after startDate
      if (endDate < startDate) {
        throw new Error("End date must be after start date");
      }

      console.log(
        `[AnalyticsService] Fetching analytics from ${startDate.toISOString()} to ${endDate.toISOString()}`
      );
    } else {
      // Otherwise, use days parameter (backward compatible)
      const days = options.days || options || 7;
      const normalizedDays = Math.max(1, Math.min(365, Number(days)));

      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - normalizedDays);

      console.log(
        `[AnalyticsService] Fetching analytics for ${normalizedDays} days`
      );
    }

    const analytics = await getAnalyticsData(this.prisma, startDate, endDate);

    console.log(`[AnalyticsService] Successfully fetched analytics data`);

    return analytics;
  }
}
