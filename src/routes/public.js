import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  const { NODE_ENV, TEST_PAYMENT_PHONE, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = process.env;
  res.json({
    ok: true,
    env: NODE_ENV,
    phone: TEST_PAYMENT_PHONE,
    telegram: {
      enabled: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_USERNAME),
      username: TELEGRAM_BOT_USERNAME || null,
    },
  });
});

export default router;
