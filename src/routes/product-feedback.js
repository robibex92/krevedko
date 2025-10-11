import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Reviews for a product
router.get("/products/:id/reviews", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const productId = Number(req.params.id);
    const reviews = await prisma.review.findMany({
      where: { productId },
      include: { user: { select: { id: true, name: true, email: true, telegramUsername: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "REVIEWS_FETCH_FAILED" });
  }
});

router.post("/products/:id/reviews", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const productId = Number(req.params.id);
    const { rating, comment } = req.body || {};
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "INVALID_RATING" });

    const review = await prisma.review.upsert({
      where: { userId_productId: { userId: req.user.id, productId } },
      update: { rating: Number(rating), comment: comment || null },
      create: { userId: req.user.id, productId, rating: Number(rating), comment: comment || null },
    });
    res.status(201).json({ review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "REVIEW_CREATE_FAILED" });
  }
});

router.delete("/products/:id/reviews", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const productId = Number(req.params.id);
    await prisma.review.deleteMany({ where: { userId: req.user.id, productId } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "REVIEW_DELETE_FAILED" });
  }
});

// Comments
router.get("/products/:id/comments", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const productId = Number(req.params.id);
    const comments = await prisma.comment.findMany({
      where: { productId },
      include: { user: { select: { id: true, name: true, email: true, telegramUsername: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "COMMENTS_FETCH_FAILED" });
  }
});

router.post("/products/:id/comments", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const productId = Number(req.params.id);
    const { content } = req.body || {};
    if (!content || content.trim().length === 0) return res.status(400).json({ error: "CONTENT_REQUIRED" });
    const comment = await prisma.comment.create({ data: { userId: req.user.id, productId, content: content.trim() } });
    res.status(201).json({ comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "COMMENT_CREATE_FAILED" });
  }
});

router.delete("/comments/:id", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const commentId = Number(req.params.id);
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: "COMMENT_NOT_FOUND" });
    if (comment.userId !== req.user.id && req.user.role !== "ADMIN") return res.status(403).json({ error: "FORBIDDEN" });
    await prisma.comment.delete({ where: { id: commentId } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "COMMENT_DELETE_FAILED" });
  }
});

export default router;
