import { Router } from "express";
import { sha256Hex } from "../middleware/auth.js";

const router = Router();

const DEFAULT_REDIRECT = "/";
const REDIRECT_DELAY_SECONDS = 5;

const htmlEscape = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const successPage = (redirectUrl, seconds) => `
  <!DOCTYPE html>
  <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Email подтверждён</title>
      <style>
        body {
          margin: 0;
          font-family: "Segoe UI", Roboto, sans-serif;
          background: #f6f8fb;
          color: #1b1b1f;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 12px 40px rgba(20, 33, 61, 0.12);
          padding: 48px 40px;
          max-width: 420px;
          width: 100%;
          text-align: center;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        h1 {
          margin: 0 0 12px;
          font-size: 24px;
        }
        p {
          margin: 8px 0;
          line-height: 1.6;
        }
        a.button {
          display: inline-block;
          margin-top: 24px;
          padding: 12px 24px;
          background: #2f80ed;
          color: #ffffff;
          text-decoration: none;
          border-radius: 10px;
          font-weight: 600;
        }
        a.button:hover {
          background: #2c6ad6;
        }
        .countdown {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
      </style>
      <script>
        const redirectUrl = ${JSON.stringify(redirectUrl)};
        const redirectDelay = ${Number(seconds) || REDIRECT_DELAY_SECONDS};
        let remaining = redirectDelay;

        function tick() {
          const el = document.getElementById("seconds");
          if (el) {
            el.textContent = remaining;
          }
          if (remaining <= 0) {
            window.location.assign(redirectUrl);
            return;
          }
          remaining -= 1;
          setTimeout(tick, 1000);
        }

        document.addEventListener("DOMContentLoaded", () => {
          tick();
        });
      </script>
    </head>
    <body>
      <div class="card">
        <div class="icon">✅</div>
        <h1>Email подтверждён</h1>
        <p>Вы молодец 😎 Сейчас вернём вас на сайт.</p>
        <p>Перенос через <span class="countdown" id="seconds">${seconds}</span> сек.</p>
        <p>Если не хотите ждать — нажмите на кнопку ниже.</p>
        <a class="button" href="${htmlEscape(redirectUrl)}">Вернуться на сайт</a>
      </div>
    </body>
  </html>
`;

const errorPage = (message) => `
  <!DOCTYPE html>
  <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Ссылка недействительна</title>
      <style>
        body {
          margin: 0;
          font-family: "Segoe UI", Roboto, sans-serif;
          background: #1f2933;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
          text-align: center;
        }
        .card {
          max-width: 420px;
        }
        h1 {
          font-size: 26px;
          margin-bottom: 16px;
        }
        p {
          margin: 0;
          font-size: 18px;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🥲 Ой!</h1>
        <p>${htmlEscape(message)}</p>
      </div>
    </body>
  </html>
`;

router.get("/verify-email", async (req, res) => {
  const prisma = req.app?.locals?.prisma;
  if (!prisma) {
    return res
      .status(500)
      .send(errorPage("⚠️ Ошибка на сервере. Попробуйте позже."));
  }

  const token = String(req.query.token || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();

  if (!token || !email) {
    return res
      .status(400)
      .send(errorPage("❌ Ссылка недействительна или устарела."));
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (
      !user ||
      !user.emailVerificationTokenHash ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationTokenHash !== sha256Hex(token)
    ) {
      return res
        .status(400)
        .send(errorPage("❌ Ссылка недействительна или устарела."));
    }

    if (user.emailVerificationExpiresAt < new Date()) {
      return res
        .status(400)
        .send(errorPage("⌛️ Срок действия ссылки истёк. Попросите новую."));
    }

    if (!user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
      });
    }

    const origin = (process.env.FRONTEND_ORIGIN || DEFAULT_REDIRECT).trim();
    const redirectTarget = origin || DEFAULT_REDIRECT;

    return res.send(successPage(redirectTarget, REDIRECT_DELAY_SECONDS));
  } catch (error) {
    console.error("[verify-email] failed", error);
    return res
      .status(500)
      .send(errorPage("⚠️ Ошибка на сервере. Попробуйте позже."));
  }
});

export default router;
