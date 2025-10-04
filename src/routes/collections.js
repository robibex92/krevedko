import { Router } from "express";
import { getCached, setCache } from "../services/cache.js";
import { getActiveCollections, resolveCollectionSelection } from "../services/collections.js";

const router = Router();

// GET /api/collections/active
router.get("/collections/active", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const col = await prisma.collection.findFirst({ where: { status: "ACTIVE" } });
    res.json({ collection: col || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ACTIVE_COLLECTION_FETCH_FAILED" });
  }
});

// GET /api/collections
router.get("/collections", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const cacheKey = "collections_active";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const collections = await getActiveCollections(prisma);
    const payload = {
      collections: collections.map((col) => ({
        id: col.id,
        title: col.title,
        startsAt: col.startsAt,
        endsAt: col.endsAt,
        status: col.status,
        notes: col.notes,
      })),
    };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "COLLECTIONS_FETCH_FAILED" });
  }
});

// GET /api/products
router.get("/products", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { collection_id } = req.query;
    const activeCollections = await getActiveCollections(prisma);
    if (!activeCollections.length) return res.json({ collections: [], products: [] });

    let targetCollections = activeCollections;
    let cacheKey = "products_all";

    const isNumericId =
      typeof collection_id === "string" &&
      collection_id !== "" &&
      collection_id !== "current" &&
      collection_id !== "all" &&
      Number.isInteger(Number(collection_id));

    if (collection_id === "current") {
      const selected = await resolveCollectionSelection({ res, activeCollections });
      if (!selected) return;
      targetCollections = [selected];
      cacheKey = `products_collection_${selected.id}`;
    } else if (isNumericId) {
      const id = Number(collection_id);
      const selected = await resolveCollectionSelection({ collectionId: id, activeCollections, res });
      if (!selected) return;
      targetCollections = [selected];
      cacheKey = `products_collection_${selected.id}`;
    } else if (collection_id === "all") {
      cacheKey = "products_all";
    } else if (activeCollections.length === 1) {
      targetCollections = [activeCollections[0]];
      cacheKey = `products_collection_${activeCollections[0].id}`;
    }

    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const activeProducts = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    });

    const collectionsPayload = [];
    for (const col of targetCollections) {
      const overrides = await prisma.collectionProduct.findMany({
        where: { collectionId: col.id },
      });
      const overrideByProductId = new Map(overrides.map((cp) => [cp.productId, cp]));

      const products = activeProducts
        .map((product) => {
          const cp = overrideByProductId.get(product.id);
          if (cp?.isActive === false) return null;

          const stepDecimal = cp?.stepOverrideDecimal ?? product.stepDecimal;
          const priceKopecks = cp?.priceOverrideKopecks ?? product.priceKopecks;
          const displayStockHint = cp?.displayStockHint || product.displayStockHint || null;
          let tags = null;
          if (product.tags) {
            try {
              tags = JSON.parse(product.tags);
            } catch {
              tags = null;
            }
          }

          return {
            id: product.id,
            title: product.title,
            description: product.description,
            category: product.category,
            imagePath: product.imagePath,
            unitLabel: product.unitLabel,
            stepDecimal: stepDecimal && typeof stepDecimal.toString === "function" ? stepDecimal.toString() : String(stepDecimal ?? ""),
            priceKopecks: Number(priceKopecks),
            stockQuantity: product.stockQuantity && typeof product.stockQuantity.toString === "function"
              ? product.stockQuantity.toString()
              : String(product.stockQuantity ?? ""),
            minStock: product.minStock && typeof product.minStock.toString === "function"
              ? product.minStock.toString()
              : String(product.minStock ?? ""),
            stockOverride:
              cp?.stockOverride != null
                ? typeof cp.stockOverride.toString === "function"
                  ? cp.stockOverride.toString()
                  : String(cp.stockOverride)
                : null,
            displayStockHint,
            isAvailable: product.isActive && (cp?.isActive !== false) && displayStockHint !== "OUT",
            tags,
            searchKeywords: product.searchKeywords,
            collectionId: col.id,
          };
        })
        .filter(Boolean);

      collectionsPayload.push({
        collection: { id: col.id, title: col.title, startsAt: col.startsAt, endsAt: col.endsAt, status: col.status },
        products,
      });
    }

    const response = { collections: collectionsPayload };
    if (collectionsPayload.length === 1) {
      response.products = collectionsPayload[0].products;
      response.collectionId = collectionsPayload[0].collection.id;
    }

    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PRODUCTS_FETCH_FAILED" });
  }
});

export default router;
