import { BaseRepository } from "../core/base/BaseRepository.js";

/**
 * Repository for telegram admin operations (categories and settings)
 */
export class TelegramAdminRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "category"); // Base model
    this.prisma = prisma;
  }

  // ----------------------
  // Categories
  // ----------------------

  /**
   * Find active categories
   */
  async findActiveCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Create category
   */
  async createCategory(data) {
    return this.prisma.category.create({
      data,
    });
  }

  /**
   * Update category
   */
  async updateCategory(id, data) {
    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  // ----------------------
  // Settings
  // ----------------------

  /**
   * Find all telegram settings
   */
  async findAllSettings() {
    return this.prisma.telegramSettings.findMany({
      orderBy: { key: "asc" },
    });
  }

  /**
   * Upsert telegram setting
   */
  async upsertSetting(key, data) {
    const { chatId, threadId, description } = data || {};
    return this.prisma.telegramSettings.upsert({
      where: { key },
      update: {
        chatId: chatId || null,
        threadId: threadId || null,
        description: description || null,
      },
      create: {
        key,
        chatId: chatId || null,
        threadId: threadId || null,
        description: description || null,
      },
    });
  }
}
