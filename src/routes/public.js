import { Router } from "express";

import { recipeAuthorInclude, toRecipeDetail, toRecipeSummary } from "../utils/recipes.js";

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

router.get("/public/recipes", async (req, res) => {
  const prisma = req.app.locals.prisma;
  const page = Math.max(1, Number.parseInt(req.query.page ?? "1", 10) || 1);
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(req.query.pageSize ?? "10", 10) || 10));
  const skip = (page - 1) * pageSize;

  try {
    const [total, recipes] = await Promise.all([
      prisma.recipe.count({ where: { status: "PUBLISHED" } }),
      prisma.recipe.findMany({
        where: { status: "PUBLISHED" },
        include: recipeAuthorInclude,
        orderBy: { publishedAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    res.json({
      recipes: recipes.map((recipe) => toRecipeSummary(recipe)),
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "RECIPES_FETCH_FAILED" });
  }
});

router.get("/public/recipes/:slug", async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { slug } = req.params;
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { slug },
      include: recipeAuthorInclude,
    });
    if (!recipe || recipe.status !== "PUBLISHED") {
      return res.status(404).json({ error: "RECIPE_NOT_FOUND" });
    }
    return res.json({ recipe: toRecipeDetail(recipe) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "RECIPE_FETCH_FAILED" });
  }
});

export default router;
