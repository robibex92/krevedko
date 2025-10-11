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
}
