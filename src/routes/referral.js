import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/referral/info", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const userId = req.session.user.id;
    if (!userId) {
      return res.status(401).json({ error: "USER_NOT_AUTHENTICATED" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referralCode: true,
        loyaltyPoints: true,
        telegramId: true,
        telegramUsername: true,
        telegramPhotoUrl: true,
        referrals: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    if (!user.referralCode) {
      const referralCode = `REF${user.id}${Math.random()
        .toString(36)
        .substr(2, 4)
        .toUpperCase()}`;
      await prisma.user.update({
        where: { id: user.id },
        data: { referralCode },
      });
      user.referralCode = referralCode;
    }

    res.json({ user });
  } catch (err) {
    console.error("Referral info error:", err);
    res.status(500).json({ error: "REFERRAL_INFO_FETCH_FAILED" });
  }
});

router.post("/referral/use", async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { referralCode } = req.body || {};
    if (!referralCode)
      return res.status(400).json({ error: "REFERRAL_CODE_REQUIRED" });
    const referrer = await prisma.user.findUnique({ where: { referralCode } });
    if (!referrer)
      return res.status(404).json({ error: "INVALID_REFERRAL_CODE" });
    req.session.referralCode = referralCode;
    req.session.referrerId = referrer.id;
    res.json({
      success: true,
      referrerName: referrer.name || referrer.email || "Пользователь",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "REFERRAL_USE_FAILED" });
  }
});

router.get("/referral/stats", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const userId = req.session.user.id;
    if (!userId) {
      return res.status(401).json({ error: "USER_NOT_AUTHENTICATED" });
    }

    const stats = await prisma.user.aggregate({
      where: { referredBy: userId },
      _count: { id: true },
    });

    const referrals = await prisma.user.findMany({
      where: { referredBy: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        orders: {
          select: { totalKopecks: true },
        },
      },
    });

    const totalReferralRevenue = referrals.reduce(
      (sum, ref) =>
        sum +
        ref.orders.reduce(
          (orderSum, order) => orderSum + (order.totalKopecks || 0),
          0
        ),
      0
    );

    res.json({
      totalReferrals: stats._count.id,
      referrals,
      totalReferralRevenue,
    });
  } catch (err) {
    console.error("Referral stats error:", err);
    res.status(500).json({ error: "REFERRAL_STATS_FETCH_FAILED" });
  }
});

export default router;
