import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getCached, setCache, clearCache } from "../services/cache.js";

const router = Router();

// GET /api/favorites
router.get("/favorites", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const cacheKey = `favorites:${req.user.id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json({ products: cached });

    const favorites = await prisma.favorite.findMany({ where: { userId: req.user.id }, include: { product: true }, orderBy: { createdAt: "desc" } });

    const products = favorites.map((fav) => ({
      id: fav.product.id,
      title: fav.product.title,
      description: fav.product.description,
      category: fav.product.category,
      imagePath: fav.product.imagePath,
      unitLabel: fav.product.unitLabel,
      stepDecimal: fav.product.stepDecimal.toString(),
      priceKopecks: fav.product.priceKopecks,
      stockQuantity: fav.product.stockQuantity.toString(),
      displayStockHint: fav.product.displayStockHint,
      isAvailable: fav.product.isActive && fav.product.displayStockHint !== "OUT",
    }));

    setCache(cacheKey, products);
    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "FAVORITES_FETCH_FAILED" });
  }
});

// POST /api/favorites
router.post("/favorites", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { product_id } = req.body || {};
    const productId = Number(product_id);
    if (!productId) return res.status(400).json({ error: "PRODUCT_ID_REQUIRED" });
    const favorite = await prisma.favorite.upsert({
      where: { userId_productId: { userId: req.user.id, productId } },
      update: {},
      create: { userId: req.user.id, productId },
    });
    clearCache(`favorites:${req.user.id}`);
    res.status(201).json({ favorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "FAVORITE_ADD_FAILED" });
  }
});

// DELETE /api/favorites/:productId
router.delete("/favorites/:productId", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const productId = Number(req.params.productId);
    await prisma.favorite.deleteMany({ where: { userId: req.user.id, productId } });
    clearCache(`favorites:${req.user.id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "FAVORITE_REMOVE_FAILED" });
  }
});

export default router;
