import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT = "587",
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM = "no-reply@example.com",
  APP_BASE_URL = "http://localhost:5173",
} = process.env;

export async function getMailer() {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  // Dev fallback: stream to console
  return {
    sendMail: async (opts) => {
      console.log("[mail]", opts);
      return { messageId: `dev-${Date.now()}` };
    },
  };
}
export async function sendVerificationEmail(email, token) {
  const mailer = await getMailer();

  // Всегда используем APP_BASE_URL + /verify-email
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  console.log(`=== Verification URL: ${verifyUrl} ===`);

  const html = `
    <p>Здравствуйте!</p>
    <p>Подтвердите ваш email, перейдя по ссылке ниже. Ссылка действует 24 часа.</p>
    <p><a href="${verifyUrl}">Подтвердить email</a></p>
    <p>Если вы не регистрировались, просто проигнорируйте письмо.</p>
  `;
  const text = `Подтвердите email: ${verifyUrl}\nСсылка действует 24 часа.`;

  await mailer.sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: "Подтверждение email",
    html,
    text,
  });
}
