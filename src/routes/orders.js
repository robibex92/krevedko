import { Router } from "express";
import { sendTelegramMessage } from "../services/telegram.js";
import { dec, isMultipleOf } from "../utils/decimal.js";
import { getActiveCollections, resolveCollectionSelection } from "../services/collections.js";
import { resolvePricingStep, makeOrderNumber } from "../services/pricing.js";
import { requireAuth } from "../middleware/auth.js";
import { paymentUpload } from "../services/uploads.js";

const router = Router();

// POST /api/cart/submit
router.post("/cart/submit", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const payload = req.body || {};

    const ordersPayload = Array.isArray(payload.orders) && payload.orders.length
      ? payload.orders
      : [{ collectionId: payload.collection_id ?? payload.collectionId ?? undefined, deliveryType: payload.deliveryType, deliveryAddress: payload.deliveryAddress }];

    const activeCollections = await getActiveCollections(prisma);
    if (!activeCollections.length) return res.status(400).json({ error: "NO_ACTIVE_COLLECTION" });

    const selection = [];
    const seen = new Set();
    for (const entry of ordersPayload) {
      const desiredId = entry.collectionId !== undefined ? Number(entry.collectionId) : undefined;
      const collection = await resolveCollectionSelection({ collectionId: desiredId, activeCollections, res, requireExplicit: activeCollections.length > 1 && desiredId === undefined });
      if (!collection) return;
      if (seen.has(collection.id)) continue;
      seen.add(collection.id);
      selection.push({ collection, deliveryType: entry.deliveryType || payload.deliveryType || "PICKUP", deliveryAddress: entry.deliveryAddress || payload.deliveryAddress || null });
    }

    if (!selection.length) return res.status(400).json({ error: "NO_COLLECTION_SELECTED" });

    const transactionResult = await prisma.$transaction(async (tx) => {
      const createdOrders = [];
      for (const target of selection) {
        const items = await tx.cartItem.findMany({ where: { userId: req.session.user.id, collectionId: target.collection.id }, include: { product: true }, orderBy: { id: "asc" } });
        if (!items.length) {
          const err = new Error("CART_EMPTY");
          err.meta = { collectionId: target.collection.id };
          throw err;
        }

        let total = dec(0);
        const prepared = [];
        for (const it of items) {
          const resolved = await resolvePricingStep(it.productId, target.collection.id, tx);
          if (!resolved) { const err = new Error("PRODUCT_NOT_AVAILABLE"); err.meta = { collectionId: target.collection.id }; throw err; }
          const displayHint = resolved.override?.displayStockHint ?? resolved.product.displayStockHint;
          if (!resolved.product.isActive || displayHint === "OUT") { const err = new Error("PRODUCT_NOT_AVAILABLE"); err.meta = { collectionId: target.collection.id }; throw err; }

          const qStr = it.quantityDecimal.toString();
          const stepStr = resolved.step.toString();
          if (!isMultipleOf(qStr, stepStr)) { const err = new Error("QUANTITY_NOT_MULTIPLE_OF_STEP"); err.meta = { collectionId: target.collection.id, step: stepStr }; throw err; }

          const sub = dec(resolved.price).mul(dec(qStr));
          if (!sub.mod(1).eq(0)) { const err = new Error("PRICE_STEP_MISMATCH"); err.meta = { collectionId: target.collection.id }; throw err; }

          total = total.add(sub);
          prepared.push({ cartItem: it, unitPriceKopecks: resolved.price, subtotalKopecks: sub.toNumber() });
        }

        const deliveryType = target.deliveryType || "PICKUP";
        const deliveryCost = deliveryType === "DELIVERY" && total.lt(300000) ? 0 : 0;
        const finalTotal = total.add(dec(deliveryCost));

        const order = await tx.order.create({ data: { userId: req.session.user.id, collectionId: target.collection.id, status: "SUBMITTED", totalKopecks: finalTotal.toNumber(), deliveryType, deliveryAddress: deliveryType === "DELIVERY" ? (target.deliveryAddress || null) : null, deliveryCost } });

        const orderNumber = makeOrderNumber(order.id);
        const orderWithNumber = await tx.order.update({ where: { id: order.id }, data: { orderNumber } });

        for (const p of prepared) {
          await tx.orderItem.create({ data: { orderId: order.id, productId: p.cartItem.productId, titleSnapshot: p.cartItem.product.title, unitLabelSnapshot: p.cartItem.product.unitLabel, quantityDecimal: p.cartItem.quantityDecimal.toString(), unitPriceKopecks: p.unitPriceKopecks, subtotalKopecks: p.subtotalKopecks, imagePathSnapshot: p.cartItem.product.imagePath || null } });
        }

        await tx.cartItem.deleteMany({ where: { userId: req.session.user.id, collectionId: target.collection.id } });
        createdOrders.push(orderWithNumber);
      }
      return createdOrders;
    });

    // Best-effort admin notifications via Telegram
    try {
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "245946670"; // default as requested
      const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = process.env;
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_USERNAME && ADMIN_TELEGRAM_ID) {
        // Load fresh user for richer data
        const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
        const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || "Пользователь";
        const tgLine = user?.telegramUsername ? `@${user.telegramUsername}` : "аккаунт создан через почту";
        const linesFor = (ord) => [
          "На сайте создан новый заказ",
          "",
          `Номер заказа: ${ord.orderNumber}`,
          `от: ${fullName}`,
          `телеграм акк: ${tgLine}`,
        ].join("\n");
        const messages = transactionResult.map((ord) => sendTelegramMessage(ADMIN_TELEGRAM_ID, linesFor(ord)));
        await Promise.allSettled(messages);
      }
    } catch (e) {
      console.error("[orders] telegram admin notify failed", e);
    }

    res.status(201).json({ orders: transactionResult.map((order) => ({ orderId: order.id, orderNumber: order.orderNumber, collectionId: order.collectionId })) });
  } catch (err) {
    console.error(err);
    const code = String(err.message || "");
    if (["PRODUCT_NOT_AVAILABLE", "QUANTITY_NOT_MULTIPLE_OF_STEP", "PRICE_STEP_MISMATCH"].includes(code)) {
      return res.status(400).json({ error: code });
    }
    const meta = err.meta || {};
    if (code === "CART_EMPTY") return res.status(400).json({ error: code, collectionId: meta.collectionId || null });
    if (meta.collectionId) { const payload = { error: code, collectionId: meta.collectionId }; if (meta.step) payload.step = meta.step; return res.status(400).json(payload); }
    res.status(500).json({ error: "ORDER_SUBMIT_FAILED" });
  }
});

// GET /api/orders
router.get("/orders", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const orders = await prisma.order.findMany({ where: { userId: req.session.user.id }, orderBy: { submittedAt: "desc" }, select: { id: true, collectionId: true, status: true, totalKopecks: true, submittedAt: true, orderNumber: true } });
    const normalized = orders.map((order) => ({ ...order, orderNumber: order.orderNumber || makeOrderNumber(order.id) }));
    res.json({ orders: normalized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ORDERS_FETCH_FAILED" });
  }
});

// GET /api/orders/:id
router.get("/orders/:id", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const id = Number(req.params.id);
    const order = await prisma.order.findFirst({ where: { id, userId: req.session.user.id }, include: { items: true, proofs: true } });
    if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    order.orderNumber = order.orderNumber || makeOrderNumber(order.id);
    const items = order.items.map((it) => ({ ...it, quantityDecimal: it.quantityDecimal.toString() }));
    res.json({ order: { ...order, items } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ORDER_FETCH_FAILED" });
  }
});

// POST /api/orders/:id/payment-proof
router.post("/orders/:id/payment-proof", requireAuth, paymentUpload.single("image"), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const id = Number(req.params.id);
    const order = await prisma.order.findFirst({ where: { id, userId: req.session.user.id } });
    if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });

    const relPath = ["payments", req.file.filename].join("/");
    const proof = await prisma.paymentProof.create({ data: { orderId: order.id, imagePath: relPath, note: null } });
    res.status(201).json({ proof });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PAYMENT_PROOF_UPLOAD_FAILED" });
  }
});

// POST /api/orders/:id/repeat
router.post("/orders/:id/repeat", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const id = Number(req.params.id);
    const order = await prisma.order.findFirst({ where: { id, userId: req.session.user.id }, include: { items: true } });
    if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });

    const targetCollectionInput = req.body?.collection_id ?? req.body?.collectionId ?? req.query?.collection_id;
    let parsedTargetId;
    if (targetCollectionInput !== undefined) {
      parsedTargetId = Number(targetCollectionInput);
      if (!Number.isInteger(parsedTargetId)) return res.status(400).json({ error: "INVALID_COLLECTION_ID" });
    }
    const activeCollections = await getActiveCollections(prisma);
    const targetCollection = await resolveCollectionSelection({ collectionId: parsedTargetId, activeCollections, res, requireExplicit: activeCollections.length > 1 && targetCollectionInput === undefined });
    if (!targetCollection) return;

    await prisma.$transaction(async (tx) => {
      for (const it of order.items) {
        const productId = it.productId;
        const resolved = await tx.collectionProduct.findUnique({ where: { collectionId_productId: { collectionId: targetCollection.id, productId } } });
        const prod = await tx.product.findUnique({ where: { id: productId } });
        if (!prod || !prod.isActive) continue;
        if (resolved && resolved.isActive === false) continue;
        const step = (resolved?.stepOverrideDecimal ?? prod.stepDecimal).toString();
        let qty = dec(it.quantityDecimal.toString());
        const qmod = qty.mod(dec(step));
        if (!qmod.isZero()) qty = qty.sub(qmod);
        if (qty.lte(0)) continue;
        const price = resolved?.priceOverrideKopecks ?? prod.priceKopecks;
        await tx.cartItem.upsert({
          where: { userId_collectionId_productId: { userId: req.session.user.id, collectionId: targetCollection.id, productId } },
          update: { quantityDecimal: qty.toString(), unitPriceKopecks: price },
          create: { userId: req.session.user.id, collectionId: targetCollection.id, productId, quantityDecimal: qty.toString(), unitPriceKopecks: price },
        });
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ORDER_REPEAT_FAILED" });
  }
});

export default router;
