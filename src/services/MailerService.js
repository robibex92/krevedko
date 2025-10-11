import { sendVerificationEmail, sendPasswordResetEmail } from "./mailer.js";

/**
 * Service wrapper for email operations
 */
export class MailerService {
  /**
   * Send email verification
   */
  async sendVerificationEmail(email, token) {
    return sendVerificationEmail(email, token);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, token) {
    return sendPasswordResetEmail(email, token);
  }
}
