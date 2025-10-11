import {
  ValidationError,
  BusinessLogicError,
} from "../core/errors/AppError.js";
import { sendTelegramMessage, buildTelegramMessage } from "./telegram.js";
import nodemailer from "nodemailer";

/**
 * Service for broadcast messages business logic
 */
export class BroadcastService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Broadcast message to users via Telegram and/or Email
   */
  async broadcastMessage(data) {
    const {
      message,
      filters = {},
      channels = ["TELEGRAM"],
      excludedUserIds = [],
    } = data;

    // Validation
    if (!message || !String(message).trim()) {
      throw new ValidationError("Message is required", "MESSAGE_REQUIRED");
    }

    // Parse filters
    const { roles, statuses, collectionIds } = this._parseFilters(filters);
    const excludedIds = this._parseExcludedIds(excludedUserIds);

    // Check channels
    const wantTelegram = channels.includes("TELEGRAM");
    const wantEmail = channels.includes("EMAIL");

    // Check configuration
    const {
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_BOT_USERNAME,
      SMTP_HOST,
      SMTP_USER,
      SMTP_PASS,
      EMAIL_FROM,
    } = process.env;

    const telegramConfigured = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_USERNAME);
    const emailConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

    const warnings = [];

    if (wantTelegram && !telegramConfigured) {
      throw new BusinessLogicError(
        "Telegram is not configured",
        "TELEGRAM_NOT_CONFIGURED"
      );
    }

    if (wantEmail && !emailConfigured) {
      warnings.push(
        "EMAIL не настроен: отсутствуют SMTP_HOST, SMTP_USER или SMTP_PASS"
      );
    }

    // Build user query
    const userWhere = this._buildUserWhere({
      wantTelegram,
      wantEmail,
      roles,
      excludedIds,
      statuses,
      collectionIds,
    });

    // Fetch recipients
    const recipients = await this.prisma.user.findMany({
      where: userWhere,
      select: { id: true, telegramId: true, name: true, email: true },
    });

    const finalMessage = buildTelegramMessage(message);

    if (!recipients.length) {
      return {
        preview: finalMessage,
        totalRecipients: 0,
        sent: 0,
        failures: [],
        warnings,
      };
    }

    // Send messages
    const failures = [];
    let sent = 0;

    // Telegram
    if (wantTelegram && telegramConfigured) {
      for (const recipient of recipients) {
        if (!recipient.telegramId) continue;

        try {
          await sendTelegramMessage(recipient.telegramId, finalMessage);
          sent += 1;
        } catch (error) {
          failures.push({
            userId: recipient.id,
            channel: "TELEGRAM",
            error: error.message,
          });
        }
      }
    }

    // Email
    if (wantEmail && emailConfigured) {
      const mailer = await this._getMailer();

      for (const recipient of recipients) {
        if (!recipient.email) continue;

        try {
          await mailer.sendMail({
            from: EMAIL_FROM || "no-reply@example.com",
            to: recipient.email,
            subject: "Сообщение от Ля Креведко",
            text: finalMessage,
            html: `<pre style="white-space: pre-wrap; font-family: inherit;">${finalMessage}</pre>`,
          });
          sent += 1;
        } catch (error) {
          failures.push({
            userId: recipient.id,
            channel: "EMAIL",
            error: error.message,
          });
        }
      }
    }

    return {
      preview: finalMessage,
      totalRecipients: recipients.length,
      sent,
      failures,
      warnings,
    };
  }

  /**
   * Parse filters
   * @private
   */
  _parseFilters(filters) {
    const roles = Array.isArray(filters.roles)
      ? filters.roles.filter((r) => typeof r === "string" && r.trim())
      : [];

    const statuses = Array.isArray(filters.statuses)
      ? filters.statuses.filter((s) => typeof s === "string" && s.trim())
      : [];

    const collectionIds = Array.isArray(filters.collectionIds)
      ? filters.collectionIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id))
      : [];

    return { roles, statuses, collectionIds };
  }

  /**
   * Parse excluded user IDs
   * @private
   */
  _parseExcludedIds(excludedUserIds) {
    return Array.isArray(excludedUserIds)
      ? excludedUserIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id))
      : [];
  }

  /**
   * Build user where clause
   * @private
   */
  _buildUserWhere({
    wantTelegram,
    wantEmail,
    roles,
    excludedIds,
    statuses,
    collectionIds,
  }) {
    const userWhere = {};

    // Channel filtering
    if (wantTelegram && !wantEmail) {
      userWhere.telegramId = { not: null };
    } else if (!wantTelegram && wantEmail) {
      userWhere.email = { not: null };
    }

    // Role filtering
    if (roles.length) {
      userWhere.role = { in: roles };
    }

    // Excluded users
    if (excludedIds.length) {
      userWhere.id = { notIn: excludedIds };
    }

    // Order filtering
    if (statuses.length || collectionIds.length) {
      userWhere.orders = {
        some: {
          ...(statuses.length ? { status: { in: statuses } } : {}),
          ...(collectionIds.length
            ? { collectionId: { in: collectionIds } }
            : {}),
        },
      };
    }

    return userWhere;
  }

  /**
   * Get mailer instance
   * @private
   */
  async _getMailer() {
    const { SMTP_HOST, SMTP_PORT = "587", SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      throw new BusinessLogicError(
        "Email is not configured",
        "EMAIL_NOT_CONFIGURED"
      );
    }

    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
}
