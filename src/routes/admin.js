import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  productUpload,
  paymentUpload,
  recipesUpload,
} from "../services/uploads.js";
import { clearCache } from "../services/cache.js";
import { makeOrderNumber } from "../services/pricing.js";
import {
  buildTelegramMessage,
  sendTelegramMessage,
} from "../services/telegram.js";
import { getMailer } from "../services/mailer.js";
import { getAnalyticsData } from "../services/analytics.js";
import {
  ensureRecipeSlug,
  normalizeRecipeContent,
  recipeAuthorInclude,
  toRecipeDetail,
  toRecipeSummary,
} from "../utils/recipes.js";
import { enqueueMessage } from "../services/telegram-bot.js";

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

router.get("/admin/recipes", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const recipes = await prisma.recipe.findMany({
      include: recipeAuthorInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json({ recipes: recipes.map((recipe) => toRecipeSummary(recipe)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ADMIN_RECIPES_FETCH_FAILED" });
  }
});

router.get(
  "/admin/recipes/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "INVALID_ID" });
      }
      const recipe = await prisma.recipe.findUnique({
        where: { id },
        include: recipeAuthorInclude,
      });
      if (!recipe) return res.status(404).json({ error: "RECIPE_NOT_FOUND" });
      res.json({ recipe: toRecipeDetail(recipe) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "ADMIN_RECIPE_FETCH_FAILED" });
    }
  }
);

router.post("/admin/recipes", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { title, content, status, excerpt, coverImagePath, publish, slug } =
      req.body || {};
    if (!title) return res.status(400).json({ error: "TITLE_REQUIRED" });
    if (status && !["DRAFT", "PUBLISHED"].includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }
    const normalizedContent = normalizeRecipeContent(content);
    const now = new Date();
    const effectiveStatus = publish ? "PUBLISHED" : status || "DRAFT";
    const authorId = req.user.id;
    const finalSlug = await ensureRecipeSlug(prisma, slug || title);
    const created = await prisma.recipe.create({
      data: {
        title,
        content: normalizedContent,
        status: effectiveStatus,
        excerpt: excerpt ?? null,
        coverImagePath: coverImagePath ?? null,
        publishedAt: effectiveStatus === "PUBLISHED" ? now : null,
        authorId,
        slug: finalSlug,
      },
      include: recipeAuthorInclude,
    });

    // Отправляем в телеграм, если рецепт опубликован
    if (effectiveStatus === "PUBLISHED") {
      try {
        await enqueueMessage(prisma, "recipe", {
          recipeId: created.id,
        });
      } catch (error) {
        console.error("Failed to enqueue recipe message:", error);
      }
    }

    res.status(201).json({ recipe: toRecipeDetail(created) });
  } catch (error) {
    console.error(error);
    const message = error?.message || "ADMIN_RECIPE_CREATE_FAILED";
    res.status(500).json({ error: "ADMIN_RECIPE_CREATE_FAILED", message });
  }
});

router.patch(
  "/admin/recipes/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "INVALID_ID" });
      }
      const existing = await prisma.recipe.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "RECIPE_NOT_FOUND" });

      const { title, content, status, excerpt, coverImagePath, publish, slug } =
        req.body || {};

      if (status && !["DRAFT", "PUBLISHED"].includes(status)) {
        return res.status(400).json({ error: "INVALID_STATUS" });
      }

      const data = {};
      if (title !== undefined) data.title = title;
      if (excerpt !== undefined) data.excerpt = excerpt ?? null;
      if (coverImagePath !== undefined)
        data.coverImagePath = coverImagePath ?? null;
      if (content !== undefined) data.content = normalizeRecipeContent(content);

      let nextStatus = existing.status;
      if (publish === true) {
        nextStatus = "PUBLISHED";
      } else if (status !== undefined) {
        nextStatus = status;
      }
      data.status = nextStatus;
      if (nextStatus === "PUBLISHED" && !existing.publishedAt) {
        data.publishedAt = new Date();
      } else if (nextStatus !== "PUBLISHED") {
        data.publishedAt = null;
      }

      if (slug !== undefined) {
        data.slug = await ensureRecipeSlug(
          prisma,
          slug || title || existing.title,
          id
        );
      }

      const updated = await prisma.recipe.update({
        where: { id },
        data,
        include: recipeAuthorInclude,
      });

      // Отправляем в телеграм, если рецепт был опубликован впервые
      if (nextStatus === "PUBLISHED" && !existing.publishedAt) {
        try {
          await enqueueMessage(prisma, "recipe", {
            recipeId: updated.id,
          });
        } catch (error) {
          console.error("Failed to enqueue recipe message:", error);
        }
      }

      res.json({ recipe: toRecipeDetail(updated) });
    } catch (error) {
      console.error(error);
      const message = error?.message || "ADMIN_RECIPE_UPDATE_FAILED";
      res.status(500).json({ error: "ADMIN_RECIPE_UPDATE_FAILED", message });
    }
  }
);

router.delete(
  "/admin/recipes/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "INVALID_ID" });
      }
      await prisma.recipe.delete({ where: { id } });
      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "ADMIN_RECIPE_DELETE_FAILED" });
    }
  }
);

router.post(
  "/admin/recipes/upload",
  requireAuth,
  requireAdmin,
  recipesUpload.array("media", 10),
  async (req, res) => {
    try {
      if (!req.files || !req.files.length) {
        return res.status(400).json({ error: "NO_FILES" });
      }
      const result = req.files.map((file) => {
        const relPath = ["recipes", file.filename].join("/");
        return {
          filename: file.filename,
          mimetype: file.mimetype,
          size: file.size,
          path: relPath,
          url: `/uploads/${relPath}`,
        };
      });
      res.json({ files: result });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "ADMIN_RECIPE_UPLOAD_FAILED" });
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

// Categories admin
router.get("/admin/categories", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    res.json({ categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CATEGORIES_FETCH_FAILED" });
  }
});

router.post(
  "/admin/categories",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const { name, telegramChatId, telegramThreadId } = req.body || {};
      if (!name || !telegramChatId) {
        return res.status(400).json({ error: "REQUIRED_FIELDS_MISSING" });
      }
      const category = await prisma.category.create({
        data: {
          name,
          telegramChatId,
          telegramThreadId: telegramThreadId || null,
        },
      });
      res.status(201).json({ category });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "CATEGORY_CREATE_FAILED" });
    }
  }
);

router.patch(
  "/admin/categories/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const id = Number(req.params.id);
      const { name, telegramChatId, telegramThreadId, isActive } =
        req.body || {};
      const data = {};
      if (name !== undefined) data.name = name;
      if (telegramChatId !== undefined) data.telegramChatId = telegramChatId;
      if (telegramThreadId !== undefined)
        data.telegramThreadId = telegramThreadId || null;
      if (isActive !== undefined) data.isActive = Boolean(isActive);
      const category = await prisma.category.update({ where: { id }, data });
      res.json({ category });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "CATEGORY_UPDATE_FAILED" });
    }
  }
);

// Telegram settings
router.get(
  "/admin/telegram-settings",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const settings = await prisma.telegramSettings.findMany({
        orderBy: { key: "asc" },
      });
      res.json({ settings });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "TELEGRAM_SETTINGS_FETCH_FAILED" });
    }
  }
);

router.put(
  "/admin/telegram-settings/:key",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const { key } = req.params;
      const { chatId, threadId, description } = req.body || {};
      const setting = await prisma.telegramSettings.upsert({
        where: { key },
        update: {
          chatId: chatId || null,
          threadId: threadId || null,
          description: description || null,
        },
        create: {
          key,
          chatId: chatId || null,
          threadId: threadId || null,
          description: description || null,
        },
      });
      res.json({ setting });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "TELEGRAM_SETTINGS_UPDATE_FAILED" });
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

    // Отправляем в телеграм, если товар активен и указана категория
    if (p.isActive && p.category) {
      try {
        const dbCategory = await prisma.category.findFirst({
          where: { name: p.category, isActive: true },
        });
        if (dbCategory) {
          await enqueueMessage(prisma, "product_create", {
            productId: p.id,
            categoryId: dbCategory.id,
          });
        }
      } catch (error) {
        console.error("Failed to enqueue product creation message:", error);
        // Не возвращаем ошибку, товар уже создан
      }
    }

    // Добавляем в чат быстрых продаж, если можно забрать сейчас
    if (p.isActive && p.canPickupNow) {
      try {
        await enqueueMessage(prisma, "quick_pickup_add", {
          productId: p.id,
        });
      } catch (error) {
        console.error("Failed to enqueue quick pickup message:", error);
      }
    }

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
      const existing = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!existing) {
        return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      }

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
      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      }

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

      // Обновляем сообщения в телеграм
      try {
        const wasActive = existing.isActive;
        const nowActive = p.isActive;

        // Если товар стал неактивным
        if (wasActive && !nowActive) {
          await enqueueMessage(prisma, "product_remove", {
            productId: p.id,
          });
        }
        // Если товар активен, обновляем сообщения
        else if (nowActive && p.category) {
          const dbCategory = await prisma.category.findFirst({
            where: { name: p.category, isActive: true },
          });
          if (dbCategory) {
            await enqueueMessage(prisma, "product_update", {
              productId: p.id,
              categoryId: dbCategory.id,
            });
          }
        }

        // Управление чатом быстрых продаж
        const wasQuickPickup = existing.canPickupNow;
        const nowQuickPickup = p.canPickupNow;

        if (nowActive && nowQuickPickup && !wasQuickPickup) {
          // Добавляем в чат быстрых продаж
          await enqueueMessage(prisma, "quick_pickup_add", {
            productId: p.id,
          });
        } else if ((!nowActive || !nowQuickPickup) && wasQuickPickup) {
          // Удаляем из чата быстрых продаж
          await enqueueMessage(prisma, "quick_pickup_remove", {
            productId: p.id,
          });
        }
      } catch (error) {
        console.error("Failed to enqueue product update message:", error);
      }

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

      // Обновляем сообщения в телеграм с новым изображением
      if (p.isActive && p.category) {
        try {
          const dbCategory = await prisma.category.findFirst({
            where: { name: p.category, isActive: true },
          });
          if (dbCategory) {
            await enqueueMessage(prisma, "product_update", {
              productId: p.id,
              categoryId: dbCategory.id,
            });
          }
        } catch (error) {
          console.error("Failed to enqueue product image update:", error);
        }
      }

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
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                imagePath: true,
                unitLabel: true,
                priceKopecks: true,
              },
            },
          },
        },
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
        product: item.product, // Сохраняем данные о товаре
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

      const existingOrder = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingOrder) {
        return res.status(404).json({ error: "ORDER_NOT_FOUND" });
      }

      const order = await prisma.order.update({
        where: { id },
        data: { status },
      });

      // Если заказ отменяется - возвращаем остатки
      if (status === "CANCELLED" && existingOrder.status !== "CANCELLED") {
        try {
          const { dec } = await import("../utils/decimal.js");
          for (const item of existingOrder.items) {
            const product = await prisma.product.findUnique({
              where: { id: item.productId },
            });
            if (product) {
              const currentStock = dec(product.stockQuantity);
              const returnedQty = dec(item.quantityDecimal);
              const newStock = currentStock.add(returnedQty);

              await prisma.product.update({
                where: { id: product.id },
                data: { stockQuantity: newStock.toString() },
              });
            }
          }
        } catch (error) {
          console.error("Failed to return stock on order cancellation:", error);
          // Не возвращаем ошибку, заказ уже отменен
        }
      }

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

// Update order item quantity
router.patch(
  "/admin/orders/items/:itemId/quantity",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    const telegramBotService =
      req.app.locals.container?.resolve("telegramBotService");

    try {
      const itemId = Number(req.params.itemId);
      const { quantity } = req.body || {};

      if (!itemId || isNaN(itemId)) {
        return res.status(400).json({ error: "INVALID_ITEM_ID" });
      }

      const numQuantity = parseFloat(quantity);
      if (!numQuantity || isNaN(numQuantity) || numQuantity <= 0) {
        return res.status(400).json({ error: "INVALID_QUANTITY" });
      }

      // Находим товар в заказе
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: { order: true },
      });

      if (!orderItem) {
        return res.status(404).json({ error: "ORDER_ITEM_NOT_FOUND" });
      }

      // Вычисляем новую сумму
      const newSubtotal = Math.round(numQuantity * orderItem.unitPriceKopecks);

      // Обновляем количество и подитог в транзакции
      const result = await prisma.$transaction(async (tx) => {
        // Обновляем товар в заказе
        const updatedItem = await tx.orderItem.update({
          where: { id: itemId },
          data: {
            quantityDecimal: String(numQuantity),
            subtotalKopecks: newSubtotal,
          },
        });

        // Пересчитываем общую сумму заказа
        const allItems = await tx.orderItem.findMany({
          where: { orderId: orderItem.orderId },
        });

        const totalKopecks = allItems.reduce(
          (sum, item) => sum + (item.subtotalKopecks || 0),
          0
        );

        const deliveryCost = orderItem.order.deliveryCost || 0;
        const finalTotal = totalKopecks + deliveryCost;

        // Обновляем итоговую сумму заказа и увеличиваем версию
        const updatedOrder = await tx.order.update({
          where: { id: orderItem.orderId },
          data: {
            totalKopecks: finalTotal,
            editVersion: { increment: 1 },
          },
          include: { items: true, user: true, collection: true },
        });

        return { item: updatedItem, order: updatedOrder };
      });

      // Отправляем обновленную фактуру в Telegram
      if (telegramBotService) {
        try {
          await telegramBotService.enqueueMessage("order_update", {
            orderId: result.order.id,
          });
        } catch (error) {
          console.error("Failed to enqueue order update notification:", error);
        }
      }

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "ORDER_ITEM_UPDATE_FAILED" });
    }
  }
);

// Delete order item
router.delete(
  "/admin/orders/items/:itemId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    const telegramBotService =
      req.app.locals.container?.resolve("telegramBotService");

    try {
      const itemId = Number(req.params.itemId);

      if (!itemId || isNaN(itemId)) {
        return res.status(400).json({ error: "INVALID_ITEM_ID" });
      }

      // Находим товар в заказе
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: { order: true },
      });

      if (!orderItem) {
        return res.status(404).json({ error: "ORDER_ITEM_NOT_FOUND" });
      }

      // Проверяем что это не единственный товар
      const itemsCount = await prisma.orderItem.count({
        where: { orderId: orderItem.orderId },
      });

      if (itemsCount <= 1) {
        return res.status(400).json({ error: "CANNOT_DELETE_LAST_ITEM" });
      }

      // Удаляем товар и пересчитываем сумму в транзакции
      const result = await prisma.$transaction(async (tx) => {
        // Удаляем товар
        await tx.orderItem.delete({
          where: { id: itemId },
        });

        // Пересчитываем общую сумму заказа
        const remainingItems = await tx.orderItem.findMany({
          where: { orderId: orderItem.orderId },
        });

        const totalKopecks = remainingItems.reduce(
          (sum, item) => sum + (item.subtotalKopecks || 0),
          0
        );

        const deliveryCost = orderItem.order.deliveryCost || 0;
        const finalTotal = totalKopecks + deliveryCost;

        // Обновляем итоговую сумму заказа и увеличиваем версию
        const updatedOrder = await tx.order.update({
          where: { id: orderItem.orderId },
          data: {
            totalKopecks: finalTotal,
            editVersion: { increment: 1 },
          },
          include: { items: true, user: true, collection: true },
        });

        return updatedOrder;
      });

      // Отправляем обновленную фактуру в Telegram
      if (telegramBotService) {
        try {
          await telegramBotService.enqueueMessage("order_update", {
            orderId: result.id,
          });
        } catch (error) {
          console.error("Failed to enqueue order update notification:", error);
        }
      }

      res.json({ order: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "ORDER_ITEM_DELETE_FAILED" });
    }
  }
);

// Add order item
router.post(
  "/admin/orders/:orderId/items",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    const telegramBotService =
      req.app.locals.container?.resolve("telegramBotService");

    try {
      const orderId = Number(req.params.orderId);
      const { productId, quantity } = req.body || {};

      if (!orderId || isNaN(orderId)) {
        return res.status(400).json({ error: "INVALID_ORDER_ID" });
      }

      if (!productId || isNaN(productId)) {
        return res.status(400).json({ error: "INVALID_PRODUCT_ID" });
      }

      const numQuantity = parseFloat(quantity);
      if (!numQuantity || isNaN(numQuantity) || numQuantity <= 0) {
        return res.status(400).json({ error: "INVALID_QUANTITY" });
      }

      // Находим заказ
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return res.status(404).json({ error: "ORDER_NOT_FOUND" });
      }

      // Находим товар и получаем цену из периода заказа
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      }

      // Получаем цену товара для этого периода
      let unitPriceKopecks = product.priceKopecks;

      if (order.collectionId) {
        const override = await prisma.collectionPriceOverride.findFirst({
          where: {
            collectionId: order.collectionId,
            productId: productId,
          },
        });
        if (override) {
          unitPriceKopecks = override.priceKopecks;
        }
      }

      const subtotalKopecks = Math.round(numQuantity * unitPriceKopecks);

      // Добавляем товар в транзакции
      const result = await prisma.$transaction(async (tx) => {
        // Создаем новый элемент заказа
        const newItem = await tx.orderItem.create({
          data: {
            orderId: orderId,
            productId: productId,
            titleSnapshot: product.title,
            unitLabelSnapshot: product.unitLabel,
            quantityDecimal: String(numQuantity),
            unitPriceKopecks: unitPriceKopecks,
            subtotalKopecks: subtotalKopecks,
            imagePathSnapshot: product.imagePath || null,
          },
        });

        // Пересчитываем общую сумму заказа
        const allItems = await tx.orderItem.findMany({
          where: { orderId: orderId },
        });

        const totalKopecks = allItems.reduce(
          (sum, item) => sum + (item.subtotalKopecks || 0),
          0
        );

        const deliveryCost = order.deliveryCost || 0;
        const finalTotal = totalKopecks + deliveryCost;

        // Обновляем итоговую сумму заказа и увеличиваем версию
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            totalKopecks: finalTotal,
            editVersion: { increment: 1 },
          },
          include: { items: true, user: true, collection: true },
        });

        return { item: newItem, order: updatedOrder };
      });

      // Отправляем обновленную фактуру в Telegram
      if (telegramBotService) {
        try {
          await telegramBotService.enqueueMessage("order_update", {
            orderId: result.order.id,
          });
        } catch (error) {
          console.error("Failed to enqueue order update notification:", error);
        }
      }

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "ORDER_ITEM_ADD_FAILED" });
    }
  }
);

// Broadcast preview - получить список получателей без отправки
router.post(
  "/admin/broadcast/preview",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const { filters = {} } = req.body || {};

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
      const excludedUserIds = Array.isArray(filters.excludedUserIds)
        ? filters.excludedUserIds
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id))
        : [];

      const userWhere = { telegramId: { not: null } };
      if (roles.length) userWhere.role = { in: roles };
      if (excludedUserIds.length) userWhere.id = { notIn: excludedUserIds };

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

      const recipients = await prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          telegramId: true,
          telegramUsername: true,
        },
      });

      res.json({ recipients });
    } catch (err) {
      console.error("[broadcast preview] Error:", err);
      res.status(500).json({ error: "BROADCAST_PREVIEW_FAILED" });
    }
  }
);

// Broadcast
router.post("/admin/broadcast", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME,
    SMTP_HOST,
    SMTP_USER,
    SMTP_PASS,
    EMAIL_FROM,
  } = process.env;
  try {
    const {
      message,
      filters = {},
      channels = ["TELEGRAM"],
      excludedUserIds = [],
    } = req.body || {};
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
    const excludedIds = Array.isArray(excludedUserIds)
      ? excludedUserIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id))
      : [];

    const wantTelegram = channels.includes("TELEGRAM");
    const wantEmail = channels.includes("EMAIL");

    // Проверяем настройки каналов
    const telegramConfigured = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_USERNAME);
    const emailConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

    const warnings = [];
    if (wantTelegram && !telegramConfigured) {
      return res.status(501).json({ error: "TELEGRAM_NOT_CONFIGURED" });
    }
    if (wantEmail && !emailConfigured) {
      warnings.push(
        "EMAIL не настроен: отсутствуют SMTP_HOST, SMTP_USER или SMTP_PASS"
      );
    }

    // Формируем условия для получателей
    const userWhere = {};
    if (wantTelegram && !wantEmail) {
      userWhere.telegramId = { not: null };
    } else if (!wantTelegram && wantEmail) {
      userWhere.email = { not: null };
    }
    // Если оба канала - получим всех у кого есть хотя бы один из контактов

    if (roles.length) userWhere.role = { in: roles };
    if (excludedIds.length) userWhere.id = { notIn: excludedIds };

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

    const recipients = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, telegramId: true, name: true, email: true },
    });

    if (!recipients.length)
      return res.json({
        preview: buildTelegramMessage(message),
        totalRecipients: 0,
        sent: 0,
        failures: [],
        warnings,
      });

    const failures = [];
    let sent = 0;
    const finalMessage = buildTelegramMessage(message);

    // Отправка через Telegram
    if (wantTelegram && telegramConfigured) {
      for (const recipient of recipients) {
        if (!recipient.telegramId) continue;
        try {
          await sendTelegramMessage(recipient.telegramId, finalMessage);
          sent += 1;
        } catch (error) {
          failures.push({
            userId: recipient.id,
            channel: "TELEGRAM",
            error: error.message,
          });
        }
      }
    }

    // Отправка через Email
    if (wantEmail && emailConfigured) {
      const mailer = await getMailer();
      for (const recipient of recipients) {
        if (!recipient.email) continue;
        try {
          await mailer.sendMail({
            from: EMAIL_FROM || "no-reply@example.com",
            to: recipient.email,
            subject: "Сообщение от Ля Креведко",
            text: finalMessage,
            html: `<pre style="white-space: pre-wrap; font-family: inherit;">${finalMessage}</pre>`,
          });
          sent += 1;
        } catch (error) {
          failures.push({
            userId: recipient.id,
            channel: "EMAIL",
            error: error.message,
          });
        }
      }
    }

    res.json({
      preview: finalMessage,
      totalRecipients: recipients.length,
      sent,
      failures,
      warnings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ADMIN_BROADCAST_FAILED" });
  }
});

// Admin analytics (legacy route - v2 route recommended)
router.get("/admin/analytics", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { days, startDate, endDate } = req.query;

    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      console.log(
        `[analytics] Fetching analytics from ${startDate} to ${endDate}`
      );
    } else {
      const normalizedDays = Number(days) || 7;
      console.log(`[analytics] Fetching analytics for ${normalizedDays} days`);
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - normalizedDays);
    }

    const analytics = await getAnalyticsData(prisma, start, end);
    console.log(`[analytics] Successfully fetched analytics data`);
    res.json(analytics);
  } catch (err) {
    console.error("[analytics] Error fetching analytics:", err);
    res.status(500).json({
      error: "ANALYTICS_FETCH_FAILED",
      message: err.message || "Unknown error",
    });
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
