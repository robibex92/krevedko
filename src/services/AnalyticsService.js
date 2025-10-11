import { getAnalyticsData } from "./analytics.js";

/**
 * Service for analytics business logic
 */
export class AnalyticsService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Get analytics data for specified number of days
   */
  async getAnalytics(days = 7) {
    const normalizedDays = Math.max(1, Math.min(365, Number(days) || 7));

    console.log(
      `[AnalyticsService] Fetching analytics for ${normalizedDays} days`
    );

    const analytics = await getAnalyticsData(this.prisma, normalizedDays);

    console.log(`[AnalyticsService] Successfully fetched analytics data`);

    return analytics;
  }
}
