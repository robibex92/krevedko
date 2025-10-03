import { Router } from "express";
import { dec, isMultipleOf } from "../utils/decimal.js";
import { getActiveCollections, resolveCollectionSelection } from "../services/collections.js";
import { resolvePricingStep } from "../services/pricing.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/cart
router.get("/cart", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { collection_id } = req.query;
    const activeCollections = await getActiveCollections(prisma);
    if (!activeCollections.length) {
      return res.json({ collections: [], items: [], totalKopecks: 0 });
    }

    let targetCollections = activeCollections;
    if (typeof collection_id === "string" && collection_id.trim()) {
      const ids = collection_id
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v));
      if (!ids.length) return res.status(400).json({ error: "INVALID_COLLECTION_FILTER" });
      const selected = activeCollections.filter((col) => ids.includes(col.id));
      if (!selected.length) return res.status(404).json({ error: "COLLECTION_NOT_FOUND" });
      targetCollections = selected;
    }

    const collectionsPayload = [];
    let grandTotal = dec(0);

    for (const col of targetCollections) {
      const items = await prisma.cartItem.findMany({
        where: { userId: req.session.user.id, collectionId: col.id },
        include: { product: true },
        orderBy: { id: "asc" },
      });

      const mapped = [];
      let total = dec(0);
      for (const it of items) {
        const product = it.product;
        const override = await prisma.collectionProduct.findUnique({
          where: { collectionId_productId: { collectionId: col.id, productId: it.productId } },
        });
        const displayHint = override?.displayStockHint ?? product.displayStockHint;
        const isOverrideActive = override?.isActive ?? true;
        const isAvailable = Boolean(product.isActive && isOverrideActive !== false && displayHint !== "OUT");

        const qStr = it.quantityDecimal.toString();
        const unitPrice = override?.priceOverrideKopecks ?? it.unitPriceKopecks;
        const sub = dec(unitPrice).mul(dec(qStr));
        if (isAvailable) {
          total = total.add(sub);
          grandTotal = grandTotal.add(sub);
        } else if (it.isActive) {
          await prisma.cartItem.update({ where: { id: it.id }, data: { isActive: false } });
        }

        mapped.push({
          id: it.id,
          productId: it.productId,
          title: product.title,
          unitLabel: product.unitLabel,
          quantityDecimal: qStr,
          unitPriceKopecks: Number(unitPrice),
          subtotalKopecks: sub.toNumber(),
          imagePath: product.imagePath || null,
          collectionId: col.id,
          isAvailable,
          displayStockHint: displayHint || null,
        });
      }

      collectionsPayload.push({
        collection: { id: col.id, title: col.title, startsAt: col.startsAt, endsAt: col.endsAt },
        items: mapped,
        totalKopecks: total.toNumber(),
      });
    }

    res.json({ collections: collectionsPayload, totalKopecks: grandTotal.toNumber() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CART_FETCH_FAILED" });
  }
});

// POST /api/cart/items
router.post("/cart/items", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { product_id, quantity, collection_id } = req.body || {};
    const activeCollections = await getActiveCollections(prisma);
    const collection = await resolveCollectionSelection({
      collectionId: collection_id ? Number(collection_id) : undefined,
      activeCollections,
      res,
      requireExplicit: activeCollections.length > 1 && !collection_id,
    });
    if (!collection) return;

    const productId = Number(product_id);
    const quantityStr = String(quantity);
    if (!productId || !quantityStr) return res.status(400).json({ error: "PRODUCT_AND_QUANTITY_REQUIRED" });

    const resolved = await resolvePricingStep(productId, collection.id, prisma);
    if (!resolved) return res.status(400).json({ error: "PRODUCT_NOT_AVAILABLE" });

    const displayHint = resolved.override?.displayStockHint ?? resolved.product.displayStockHint;
    if (displayHint === "OUT") return res.status(400).json({ error: "PRODUCT_NOT_AVAILABLE" });

    const stepStr = resolved.step.toString();
    if (!isMultipleOf(quantityStr, stepStr)) {
      return res.status(400).json({ error: "QUANTITY_NOT_MULTIPLE_OF_STEP", step: stepStr });
    }
    const subtotal = dec(resolved.price).mul(dec(quantityStr));
    if (!subtotal.mod(1).eq(0)) return res.status(400).json({ error: "PRICE_STEP_MISMATCH" });

    const item = await prisma.cartItem.upsert({
      where: { userId_collectionId_productId: { userId: req.session.user.id, collectionId: collection.id, productId } },
      update: { quantityDecimal: quantityStr, unitPriceKopecks: resolved.price, isActive: true },
      create: { userId: req.session.user.id, collectionId: collection.id, productId, quantityDecimal: quantityStr, unitPriceKopecks: resolved.price, isActive: true },
    });

    res.status(201).json({ itemId: item.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CART_ITEM_SAVE_FAILED" });
  }
});

// PATCH /api/cart/items/:id
router.patch("/cart/items/:id", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const id = Number(req.params.id);
    const { quantity } = req.body || {};
    const quantityStr = String(quantity);

    const existing = await prisma.cartItem.findFirst({ where: { id, userId: req.session.user.id }, include: { product: true, collection: true } });
    if (!existing) return res.status(404).json({ error: "CART_ITEM_NOT_FOUND" });
    if (existing.collection.status !== "ACTIVE") return res.status(400).json({ error: "COLLECTION_NOT_ACTIVE" });

    const resolved = await resolvePricingStep(existing.productId, existing.collectionId, prisma);
    if (!resolved) return res.status(400).json({ error: "PRODUCT_NOT_AVAILABLE" });

    const displayHint = resolved.override?.displayStockHint ?? resolved.product.displayStockHint;
    if (!resolved.product.isActive || displayHint === "OUT") return res.status(400).json({ error: "PRODUCT_NOT_AVAILABLE" });

    const stepStr = resolved.step.toString();
    if (!isMultipleOf(quantityStr, stepStr)) {
      return res.status(400).json({ error: "QUANTITY_NOT_MULTIPLE_OF_STEP", step: stepStr });
    }
    const subtotal = dec(resolved.price).mul(dec(quantityStr));
    if (!subtotal.mod(1).eq(0)) return res.status(400).json({ error: "PRICE_STEP_MISMATCH" });

    await prisma.cartItem.update({ where: { id }, data: { quantityDecimal: quantityStr, unitPriceKopecks: resolved.price } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CART_ITEM_UPDATE_FAILED" });
  }
});

// DELETE /api/cart/items/:id
router.delete("/cart/items/:id", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const id = Number(req.params.id);
    const existing = await prisma.cartItem.findFirst({ where: { id, userId: req.session.user.id } });
    if (!existing) return res.status(404).json({ error: "CART_ITEM_NOT_FOUND" });
    await prisma.cartItem.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CART_ITEM_DELETE_FAILED" });
  }
});

// GET /api/cart/count
router.get("/cart/count", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const activeCollections = await getActiveCollections(prisma);
    if (!activeCollections.length) return res.json({ count: 0 });
    const ids = activeCollections.map((c) => c.id);
    const count = await prisma.cartItem.count({ where: { userId: req.session.user.id, collectionId: { in: ids } } });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ count: 0, error: "CART_COUNT_FAILED" });
  }
});

// GET /api/cart/saved
router.get("/cart/saved", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const count = await prisma.cartItem.count({ where: { userId: req.session.user.id } });
    res.json({ saved: count > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CART_SAVED_CHECK_FAILED" });
  }
});

export default router;
