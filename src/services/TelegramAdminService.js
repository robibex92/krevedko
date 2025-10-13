import { ValidationError } from "../core/errors/AppError.js";

/**
 * Service for telegram admin operations (categories and settings)
 */
export class TelegramAdminService {
  constructor(telegramAdminRepository) {
    this.telegramRepo = telegramAdminRepository;
  }

  // ----------------------
  // Categories
  // ----------------------

  /**
   * Get active categories
   */
  async getCategories() {
    const categories = await this.telegramRepo.findActiveCategories();
    return { categories };
  }

  /**
   * Create category
   */
  async createCategory(data) {
    const { name, telegramChatId, telegramThreadId } = data;

    // Validation
    if (!name || !telegramChatId) {
      throw new ValidationError(
        "Name and telegram chat ID are required",
        "REQUIRED_FIELDS_MISSING"
      );
    }

    const category = await this.telegramRepo.createCategory({
      name: String(name).trim(),
      telegramChatId: String(telegramChatId).trim(),
      telegramThreadId: telegramThreadId
        ? String(telegramThreadId).trim()
        : null,
    });

    return { category };
  }

  /**
   * Update category
   */
  async updateCategory(id, data) {
    const { name, telegramChatId, telegramThreadId, isActive } = data;

    const updateData = {};
    if (name !== undefined) {
      updateData.name = String(name).trim();
    }
    if (telegramChatId !== undefined) {
      updateData.telegramChatId = String(telegramChatId).trim();
    }
    if (telegramThreadId !== undefined) {
      updateData.telegramThreadId = telegramThreadId
        ? String(telegramThreadId).trim()
        : null;
    }
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const category = await this.telegramRepo.updateCategory(id, updateData);

    return { category };
  }

  // ----------------------
  // Settings
  // ----------------------

  /**
   * Get telegram settings
   */
  async getSettings() {
    const settings = await this.telegramRepo.findAllSettings();
    return { settings };
  }

  /**
   * Update telegram setting
   */
  async updateSetting(key, data) {
    if (!key) {
      throw new ValidationError("Key is required", "KEY_REQUIRED");
    }

    const setting = await this.telegramRepo.upsertSetting(
      String(key).trim(),
      data || {}
    );

    return { setting };
  }
}
