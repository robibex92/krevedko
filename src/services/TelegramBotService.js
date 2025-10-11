import { enqueueMessage } from "./telegram-bot.js";

/**
 * Service wrapper for Telegram bot operations
 */
export class TelegramBotService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Enqueue message to Telegram bot
   */
  async enqueueMessage(messageType, data) {
    return enqueueMessage(this.prisma, messageType, data);
  }
}
