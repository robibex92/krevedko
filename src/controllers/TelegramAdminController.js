import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for telegram admin operations (categories and settings)
 */
export class TelegramAdminController extends BaseController {
  constructor(telegramAdminService) {
    super();
    this.telegramService = telegramAdminService;
  }

  // ----------------------
  // Categories
  // ----------------------

  /**
   * GET /api/admin/categories
   * Get active categories
   */
  getCategories = async (req, res) => {
    const result = await this.telegramService.getCategories();
    this.success(res, result);
  };

  /**
   * GET /api/public/categories/:id/products
   * Get products for a category
   */
  getCategoryProducts = async (req, res) => {
    const categoryId = this.getIdParam(req);
    const result = await this.telegramService.getCategoryProducts(categoryId);
    this.success(res, result);
  };

  /**
   * POST /api/admin/categories
   * Create category
   */
  createCategory = async (req, res) => {
    const result = await this.telegramService.createCategory(req.body || {});
    this.created(res, result);
  };

  /**
   * PATCH /api/admin/categories/:id
   * Update category
   */
  updateCategory = async (req, res) => {
    const id = this.getIdParam(req);
    const result = await this.telegramService.updateCategory(
      id,
      req.body || {}
    );
    this.success(res, result);
  };

  // ----------------------
  // Settings
  // ----------------------

  /**
   * GET /api/admin/telegram-settings
   * Get telegram settings
   */
  getSettings = async (req, res) => {
    const result = await this.telegramService.getSettings();
    this.success(res, result);
  };

  /**
   * PUT /api/admin/telegram-settings/:key
   * Update telegram setting
   */
  updateSetting = async (req, res) => {
    const key = req.params.key;
    const { chatId, threadId, description } = req.body || {};
    const result = await this.telegramService.updateSetting(key, {
      chatId,
      threadId,
      description,
    });
    this.success(res, result);
  };
}
