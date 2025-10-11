import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for broadcast endpoints
 */
export class BroadcastController extends BaseController {
  constructor(broadcastService) {
    super();
    this.broadcastService = broadcastService;
  }

  /**
   * POST /api/admin/broadcast
   * Broadcast message to users
   */
  broadcastMessage = async (req, res) => {
    const result = await this.broadcastService.broadcastMessage(req.body || {});

    this.success(res, result);
  };

  /**
   * POST /api/admin/broadcast/preview
   * Preview broadcast recipients without sending
   */
  previewBroadcast = async (req, res) => {
    const recipients = await this.broadcastService.previewRecipients(
      req.body || {}
    );

    this.success(res, { recipients });
  };
}
