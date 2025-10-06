import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { productUpload, paymentUpload } from "../services/uploads.js";
import { clearCache } from "../services/cache.js";
import { makeOrderNumber } from "../services/pricing.js";
import {
  buildTelegramMessage,
  sendTelegramMessage,
} from "../services/telegram.js";
import { getAnalyticsData } from "../services/analytics.js";

const router = Router();

// Collections CRUD
router.post(
  "/admin/collections",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const { title, startsAt, endsAt, notes } = req.body || {};
      if (!title) return res.status(400).json({ error: "TITLE_REQUIRED" });
      const col = await prisma.collection.create({
        data: {
          title,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          status: "DRAFT",
          notes: notes || null,
        },
      });
      clearCache("collections_active");
      res.status(201).json({ collection: col });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "COLLECTION_CREATE_FAILED" });
    }
  }
);

router.patch(
  "/admin/collections/:id/activate",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const now = new Date();
      const result = await prisma.collection.update({
        where: { id },
        data: { status: "ACTIVE", startsAt: now, endsAt: null },
      });
      clearCache("collections_active");
      res.json({ collection: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "COLLECTION_ACTIVATE_FAILED" });
    }
  }
);

router.patch(
  "/admin/collections/:id/close",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const now = new Date();
      const col = await prisma.collection.update({
        where: { id },
        data: { status: "CLOSED", endsAt: now },
      });
      clearCache("collections_active");
      res.json({ collection: col });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "COLLECTION_CLOSE_FAILED" });
    }
  }
);

// Products admin
router.get("/admin/products", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const products = await prisma.product.findMany({ orderBy: { id: "asc" } });
    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PRODUCTS_FETCH_FAILED" });
  }
});

router.post("/admin/products", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const {
      title,
      description,
      category,
      unitLabel,
      stepDecimal,
      priceKopecks,
      isActive,
      stockQuantity,
      minStock,
      tags,
      searchKeywords,
      displayStockHint,
      canPickupNow,
    } = req.body || {};
    if (
      !title ||
      !unitLabel ||
      stepDecimal === undefined ||
      priceKopecks === undefined
    ) {
      return res.status(400).json({ error: "REQUIRED_FIELDS_MISSING" });
    }
    const p = await prisma.product.create({
      data: {
        title,
        description: description || "",
        category: category ?? null,
        unitLabel,
        stepDecimal: String(stepDecimal),
        priceKopecks: Number(priceKopecks),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        stockQuantity: stockQuantity ? String(stockQuantity) : "0",
        minStock: minStock ? String(minStock) : "0",
        tags: tags ? JSON.stringify(tags) : null,
        searchKeywords: searchKeywords || null,
        displayStockHint: displayStockHint ? String(displayStockHint) : null,
        canPickupNow:
          canPickupNow !== undefined ? Boolean(canPickupNow) : false,
      },
    });
    clearCache("products");
    clearCache("favorites:");
    res.status(201).json({ product: p });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PRODUCT_CREATE_FAILED" });
  }
});

router.patch(
  "/admin/products/:id/stock",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const productId = Number(req.params.id);
      const { stockQuantity, minStock } = req.body || {};
      if (stockQuantity === undefined && minStock === undefined) {
        return res.status(400).json({ error: "NO_STOCK_DATA" });
      }
      const data = {};
      if (stockQuantity !== undefined)
        data.stockQuantity = String(stockQuantity);
      if (minStock !== undefined) data.minStock = String(minStock);
      const product = await prisma.product.update({
        where: { id: productId },
        data,
      });
      res.json({ product });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "STOCK_UPDATE_FAILED" });
    }
  }
);

router.get(
  "/admin/products/low-stock",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const raw = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          imagePath: true,
          unitLabel: true,
          stockQuantity: true,
          minStock: true,
        },
      });
      const { dec } = await import("../utils/decimal.js");
      const products = raw
        .filter((p) => dec(p.stockQuantity).lte(dec(p.minStock)))
        .sort((a, b) => dec(a.stockQuantity).cmp(dec(b.stockQuantity)));
      res.json({ products });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "LOW_STOCK_FETCH_FAILED" });
    }
  }
);

router.patch(
  "/admin/products/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const {
        title,
        description,
        category,
        unitLabel,
        stepDecimal,
        priceKopecks,
        isActive,
        displayStockHint,
        canPickupNow,
      } = req.body || {};
      const { tags, searchKeywords } = req.body || {};
      const data = {};
      if (title !== undefined) data.title = title;
      if (description !== undefined) data.description = description || "";
      if (category !== undefined) data.category = category ?? null;
      if (unitLabel !== undefined) data.unitLabel = unitLabel;
      if (stepDecimal !== undefined) data.stepDecimal = String(stepDecimal);
      if (priceKopecks !== undefined) data.priceKopecks = Number(priceKopecks);
      if (isActive !== undefined) data.isActive = Boolean(isActive);
      if (displayStockHint !== undefined)
        data.displayStockHint = displayStockHint
          ? String(displayStockHint)
          : null;
      if (canPickupNow !== undefined) data.canPickupNow = Boolean(canPickupNow);
      if (tags !== undefined)
        data.tags = Array.isArray(tags)
          ? tags.length
            ? JSON.stringify(tags)
            : null
          : tags
          ? JSON.stringify(tags)
          : null;
      if (searchKeywords !== undefined)
        data.searchKeywords = searchKeywords || null;
      const p = await prisma.product.update({ where: { id }, data });
      clearCache("products");
      clearCache("favorites:");
      res.json({ product: p });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "PRODUCT_UPDATE_FAILED" });
    }
  }
);

// Upload product image
router.post(
  "/admin/products/:id/image",
  requireAuth,
  requireAdmin,
  productUpload.single("image"),
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      if (!req.file) return res.status(400).json({ error: "NO_FILE" });

      // относительный путь в /uploads
      const relPath = ["products", req.file.filename].join("/");
      const url = `/uploads/${relPath}`;

      // сохраняем путь в базу
      const p = await prisma.product.update({
        where: { id },
        data: { imagePath: relPath },
      });

      // возвращаем вместе с url для фронта
      res.json({
        product: { ...p, imageUrl: url },
        file: {
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url,
        },
      });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "PRODUCT_IMAGE_UPLOAD_FAILED", message: err.message });
    }
  }
);

// Per-collection product overrides
router.patch(
  "/admin/collections/:collectionId/products/:productId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const collectionId = Number(req.params.collectionId);
      const productId = Number(req.params.productId);
      const {
        priceOverrideKopecks,
        stepOverrideDecimal,
        isActive,
        canPickupNow,
      } = req.body || {};
      const cp = await prisma.collectionProduct.upsert({
        where: { collectionId_productId: { collectionId, productId } },
        update: {
          priceOverrideKopecks:
            priceOverrideKopecks !== undefined
              ? Number(priceOverrideKopecks)
              : undefined,
          stepOverrideDecimal:
            stepOverrideDecimal !== undefined
              ? String(stepOverrideDecimal)
              : undefined,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined,
          stockOverride:
            req.body?.stockOverride !== undefined
              ? req.body.stockOverride === null
                ? null
                : String(req.body.stockOverride)
              : undefined,
          displayStockHint:
            req.body?.displayStockHint !== undefined
              ? req.body.displayStockHint
              : undefined,
          canPickupNow:
            canPickupNow !== undefined
              ? canPickupNow === null
                ? null
                : Boolean(canPickupNow)
              : undefined,
        },
        create: {
          collectionId,
          productId,
          priceOverrideKopecks:
            priceOverrideKopecks !== undefined
              ? Number(priceOverrideKopecks)
              : null,
          stepOverrideDecimal:
            stepOverrideDecimal !== undefined
              ? String(stepOverrideDecimal)
              : null,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          stockOverride:
            req.body?.stockOverride !== undefined
              ? req.body.stockOverride === null
                ? null
                : String(req.body.stockOverride)
              : null,
          displayStockHint:
            req.body?.displayStockHint !== undefined
              ? req.body.displayStockHint
              : null,
          canPickupNow:
            canPickupNow !== undefined
              ? canPickupNow === null
                ? null
                : Boolean(canPickupNow)
              : null,
        },
      });
      clearCache("products");
      res.json({ override: cp });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "COLLECTION_PRODUCT_OVERRIDE_FAILED" });
    }
  }
);

// Orders admin
router.get("/admin/orders", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            telegramUsername: true,
            firstName: true,
            lastName: true,
            avatarPath: true,
          },
        },
        collection: { select: { id: true, title: true } },
        items: true,
        proofs: true,
      },
      orderBy: { submittedAt: "desc" },
    });
    const normalizedOrders = orders.map((order) => ({
      ...order,
      orderNumber: order.orderNumber || makeOrderNumber(order.id),
      items: order.items.map((item) => ({
        ...item,
        quantityDecimal: item.quantityDecimal.toString(),
      })),
    }));
    res.json({ orders: normalizedOrders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ADMIN_ORDERS_FETCH_FAILED" });
  }
});

router.patch(
  "/admin/orders/:id/status",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!["SUBMITTED", "PAID", "CANCELLED"].includes(status))
        return res.status(400).json({ error: "INVALID_STATUS" });
      const order = await prisma.order.update({
        where: { id },
        data: { status },
      });
      res.json({ order });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "ORDER_STATUS_UPDATE_FAILED" });
    }
  }
);

// Update delivery settings for an order
router.patch(
  "/admin/orders/:id/delivery",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const { deliveryType, deliveryAddress } = req.body || {};
      if (!["PICKUP", "DELIVERY"].includes(deliveryType)) {
        return res.status(400).json({ error: "INVALID_DELIVERY_TYPE" });
      }
      const data = { deliveryType };
      data.deliveryAddress =
        deliveryType === "DELIVERY" ? deliveryAddress || null : null;
      const order = await prisma.order.update({ where: { id }, data });
      res.json({ order });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "ORDER_DELIVERY_UPDATE_FAILED" });
    }
  }
);

router.post(
  "/admin/orders/:id/payment-proof",
  requireAuth,
  requireAdmin,
  paymentUpload.single("image"),
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const { note } = req.body || {};
      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
      if (!req.file) return res.status(400).json({ error: "NO_FILE" });
      const relPath = ["payments", req.file.filename].join("/");
      const proof = await prisma.paymentProof.create({
        data: { orderId: order.id, imagePath: relPath, note: note || null },
      });
      res.status(201).json({ proof });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "ADMIN_PAYMENT_PROOF_UPLOAD_FAILED" });
    }
  }
);

// Broadcast
router.post("/admin/broadcast", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = process.env;
  try {
    const { message, filters = {}, channels = ["TELEGRAM"] } = req.body || {};
    if (!message || !String(message).trim())
      return res.status(400).json({ error: "MESSAGE_REQUIRED" });

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
    const userIds = Array.isArray(filters.userIds)
      ? filters.userIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id))
      : [];

    const wantTelegram = channels.includes("TELEGRAM");
    const userWhere = wantTelegram ? { telegramId: { not: null } } : {};
    if (roles.length) userWhere.role = { in: roles };
    if (userIds.length) userWhere.id = { in: userIds };
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

    let recipients = [];
    if (wantTelegram) {
      if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOT_USERNAME) {
        return res.status(501).json({ error: "TELEGRAM_NOT_CONFIGURED" });
      }
      recipients = await prisma.user.findMany({
        where: userWhere,
        select: { id: true, telegramId: true, name: true, email: true },
      });
    }
    if (!recipients.length)
      return res.json({
        preview: buildTelegramMessage(message),
        totalRecipients: 0,
        sent: 0,
        failures: [],
        warnings: channels.includes("EMAIL")
          ? ["EMAIL channel not configured; skipped"]
          : [],
      });

    const failures = [];
    let sent = 0;
    const finalMessage = buildTelegramMessage(message);
    if (wantTelegram) {
      for (const recipient of recipients) {
        try {
          await sendTelegramMessage(recipient.telegramId, finalMessage);
          sent += 1;
        } catch (error) {
          failures.push({ userId: recipient.id, error: error.message });
        }
      }
    }

    res.json({
      preview: finalMessage,
      totalRecipients: recipients.length,
      sent,
      failures,
      warnings: channels.includes("EMAIL")
        ? ["EMAIL channel not configured; skipped"]
        : [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ADMIN_BROADCAST_FAILED" });
  }
});

// Admin analytics
router.get("/admin/analytics", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { days = 7 } = req.query;
    const analytics = await getAnalyticsData(prisma, Number(days));
    res.json(analytics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ANALYTICS_FETCH_FAILED" });
  }
});

// Admin collections list and patch
router.get(
  "/admin/collections",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const list = await prisma.collection.findMany({
        orderBy: [{ status: "desc" }, { id: "desc" }],
      });
      res.json({ collections: list });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "COLLECTIONS_FETCH_FAILED" });
    }
  }
);

router.patch(
  "/admin/collections/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const { title, startsAt, endsAt, notes } = req.body || {};
      const data = {};
      if (title !== undefined) data.title = title;
      if (startsAt !== undefined)
        data.startsAt = startsAt ? new Date(startsAt) : null;
      if (endsAt !== undefined) data.endsAt = endsAt ? new Date(endsAt) : null;
      if (notes !== undefined) data.notes = notes;
      const col = await prisma.collection.update({ where: { id }, data });
      clearCache("collections_active");
      res.json({ collection: col });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "COLLECTION_UPDATE_FAILED" });
    }
  }
);

export default router;
