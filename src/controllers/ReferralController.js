import { BaseController } from "../core/base/BaseController.js";
import { validateRequired } from "../core/validators/index.js";

/**
 * Controller for referral program endpoints
 */
export class ReferralController extends BaseController {
  constructor(referralService) {
    super();
    this.referralService = referralService;
  }

  /**
   * GET /api/referral/info
   * Get referral info for current user
   */
  getReferralInfo = async (req, res) => {
    const userId = this.getUserId(req);

    const result = await this.referralService.getReferralInfo(userId);

    this.success(res, result);
  };

  /**
   * POST /api/referral/use
   * Validate and save referral code to session
   */
  useReferralCode = async (req, res) => {
    const { referralCode } = req.body || {};

    validateRequired({ referralCode });

    const result = await this.referralService.validateReferralCode(
      referralCode
    );

    // Store referral code in cookie instead of session
    res.cookie("referralCode", referralCode, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: "lax"
    });

    this.success(res, {
      success: result.success,
      referrerName: result.referrerName,
    });
  };

  /**
   * GET /api/referral/stats
   * Get referral statistics for current user
   */
  getReferralStats = async (req, res) => {
    const userId = this.getUserId(req);

    const result = await this.referralService.getReferralStats(userId);

    this.success(res, result);
  };
}
