/**
 * Payment Webhooks Routes
 * Эндпоинты для обработки webhook'ов от платежных систем
 */

import express from "express";
import { container } from "../core/di/container.js";

const router = express.Router();

/**
 * Webhook от Сбербанка
 * POST /api/webhooks/payments/sberbank
 */
router.post("/sberbank", async (req, res, next) => {
  try {
    const paymentService = container.resolve("paymentService");

    // TODO: Добавить проверку подписи от Сбербанка
    // const signature = req.headers['x-sberbank-signature'];
    // if (!verifySberbankSignature(req.body, signature)) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    await paymentService.processWebhook("sberbank", req.body);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Webhook от ЮMoney (YooKassa)
 * POST /api/webhooks/payments/yoomoney
 */
router.post("/yoomoney", async (req, res, next) => {
  try {
    const paymentService = container.resolve("paymentService");

    // TODO: Добавить проверку подписи от YooKassa
    // Пример проверки:
    // const crypto = require('crypto');
    // const signature = req.headers['http-notification-signature'];
    // const hmac = crypto.createHmac('sha256', process.env.YOOKASSA_SECRET_KEY);
    // hmac.update(JSON.stringify(req.body));
    // const calculatedSignature = hmac.digest('hex');
    // if (signature !== calculatedSignature) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    await paymentService.processWebhook("yoomoney", req.body);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Webhook от Яндекс.Кассы (если будет использоваться отдельно от YooKassa)
 * POST /api/webhooks/payments/yandex
 */
router.post("/yandex", async (req, res, next) => {
  try {
    const paymentService = container.resolve("paymentService");

    // TODO: Добавить проверку подписи от Яндекс.Кассы

    await paymentService.processWebhook("yandex", req.body);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
