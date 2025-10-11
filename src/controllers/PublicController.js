import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for public endpoints (health, etc.)
 */
export class PublicController extends BaseController {
  constructor() {
    super();
  }

  /**
   * GET /api/health
   * Health check endpoint
   */
  getHealth = async (req, res) => {
    const {
      NODE_ENV,
      TEST_PAYMENT_PHONE,
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_BOT_USERNAME,
    } = process.env;

    const health = {
      ok: true,
      env: NODE_ENV,
      phone: TEST_PAYMENT_PHONE,
      telegram: {
        enabled: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_USERNAME),
        username: TELEGRAM_BOT_USERNAME || null,
      },
    };

    this.success(res, health);
  };
}
