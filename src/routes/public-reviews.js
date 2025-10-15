import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { reviewUpload } from "../services/uploads.js";
import { enqueueMessage } from "../services/telegram-bot.js";
import path from "path";

const router = Router();

// GET /api/public/reviews
router.get("/public/reviews", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(20, Math.max(1, Number(req.query.pageSize) || 6));
    const sort = req.query.sort === "rating" ? "rating" : "createdAt";
    const direction = req.query.order === "asc" ? "asc" : "desc";

    const [items, total] = await prisma.$transaction([
      prisma.publicReview.findMany({
        orderBy:
          sort === "rating" ? { rating: direction } : { createdAt: direction },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              telegramUsername: true,
              email: true,
              avatarPath: true,
            },
          },
          images: true,
        },
      }),
      prisma.publicReview.count(),
    ]);

    const reviews = items.map((review) => ({
      id: review.id,
      title: review.title,
      content: review.content,
      rating: review.rating,
      createdAt: review.createdAt,
      user: review.user,
      images: review.images.map((img) => img.imagePath),
    }));

    res.json({
      reviews,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PUBLIC_REVIEWS_FETCH_FAILED" });
  }
});

// POST /api/public/reviews
router.post(
  "/public/reviews",
  requireAuth,
  (req, res, next) => {
    console.log("[public-reviews] Before reviewUpload middleware");
    next();
  },
  reviewUpload.array("images", 5),
  (req, res, next) => {
    console.log("[public-reviews] After reviewUpload middleware");
    console.log(
      "[public-reviews] req.files:",
      req.files ? req.files.length : "null"
    );
    console.log(
      "[public-reviews] req.file:",
      req.file ? req.file.path : "null"
    );
    next();
  },
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      const { title, content, rating } = req.body || {};
      const normalizedContent = content ? String(content).trim() : "";
      const normalizedTitle = title ? String(title).trim() : null;
      const ratingValue = Number(rating);

      if (!normalizedContent)
        return res.status(400).json({ error: "CONTENT_REQUIRED" });
      if (![2, 3, 4, 5].includes(ratingValue))
        return res.status(400).json({ error: "INVALID_RATING" });

      const review = await prisma.publicReview.create({
        data: {
          userId: req.user.id,
          title: normalizedTitle,
          content: normalizedContent,
          rating: ratingValue,
        },
      });

      if (Array.isArray(req.files) && req.files.length) {
        await prisma.publicReviewImage.createMany({
          data: req.files.map((file) => ({
            reviewId: review.id,
            imagePath: path.join("reviews", file.filename).replace(/\\/g, "/"),
          })),
        });
      }

      const created = await prisma.publicReview.findUnique({
        where: { id: review.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              telegramUsername: true,
              email: true,
              avatarPath: true,
            },
          },
          images: true,
        },
      });

      // Отправляем отзыв в телеграм
      try {
        await enqueueMessage(prisma, "review", {
          reviewId: created.id,
        });
      } catch (error) {
        console.error("Failed to enqueue review message:", error);
        // Не возвращаем ошибку, отзыв уже создан
      }

      res.status(201).json({
        review: {
          id: created.id,
          title: created.title,
          content: created.content,
          rating: created.rating,
          createdAt: created.createdAt,
          user: created.user,
          images: created.images.map((img) => img.imagePath),
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "PUBLIC_REVIEW_CREATE_FAILED" });
    }
  }
);

export default router;
