import { Router } from "express";
import { requireAuth, publicUser } from "../middleware/auth.js";
import { avatarUpload } from "../services/uploads.js";
import { makeOrderNumber } from "../services/pricing.js";

const router = Router();

router.get("/profile/me", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const userId = req.user.id;
    const [user, orders] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          telegramId: true,
          telegramUsername: true,
          telegramPhotoUrl: true,
          avatarPath: true,
          addressStreet: true,
          addressHouse: true,
          addressApartment: true,
          loyaltyPoints: true,
        },
      }),
      prisma.order.findMany({
        where: { userId },
        orderBy: { submittedAt: "desc" },
        include: { collection: { select: { id: true, title: true } } },
      }),
    ]);

    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    const mappedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber || makeOrderNumber(order.id),
      status: order.status,
      totalKopecks: order.totalKopecks,
      submittedAt: order.submittedAt,
      deliveryType: order.deliveryType,
      collection: order.collection,
    }));

    const orderGroups = {
      active: mappedOrders.filter((o) => o.status === "SUBMITTED"),
      completed: mappedOrders.filter((o) => o.status === "PAID"),
      cancelled: mappedOrders.filter((o) => o.status === "CANCELLED"),
    };

    res.json({
      user,
      orders: orderGroups,
      summary: {
        total: mappedOrders.length,
        active: orderGroups.active.length,
        completed: orderGroups.completed.length,
        cancelled: orderGroups.cancelled.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PROFILE_FETCH_FAILED" });
  }
});

router.patch("/profile", requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const {
      firstName,
      lastName,
      phone,
      addressStreet,
      addressHouse,
      addressApartment,
    } = req.body || {};
    const data = {};
    const normalize = (value) =>
      value === undefined ? undefined : String(value).trim() || null;

    if (firstName !== undefined) data.firstName = normalize(firstName);
    if (lastName !== undefined) data.lastName = normalize(lastName);
    if (phone !== undefined) data.phone = normalize(phone);
    if (addressStreet !== undefined)
      data.addressStreet = normalize(addressStreet);
    if (addressHouse !== undefined) data.addressHouse = normalize(addressHouse);
    if (addressApartment !== undefined)
      data.addressApartment = normalize(addressApartment);

    if (
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      req.body?.name !== undefined
    ) {
      const explicitName = normalize(req.body?.name);
      if (explicitName !== undefined) {
        data.name = explicitName;
      } else {
        const fn = data.firstName !== undefined ? data.firstName : undefined;
        const ln = data.lastName !== undefined ? data.lastName : undefined;
        const first = fn !== undefined ? fn : req.user.firstName;
        const last = ln !== undefined ? ln : req.user.lastName;
        const combined = [first, last].filter(Boolean).join(" ") || null;
        data.name = combined;
      }
    }

    if (Object.keys(data).length === 0)
      return res.status(400).json({ error: "NO_PROFILE_UPDATES" });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });
    req.user = publicUser(user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PROFILE_UPDATE_FAILED" });
  }
});

// Enhanced avatar upload with detailed logging and multer error handling
const avatarSingle = avatarUpload.single("avatar");
router.post(
  "/profile/avatar",
  requireAuth,
  (req, res, next) => {
    try {
      console.log("[upload/avatar] incoming", {
        ip: req.ip,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        userId: req.user?.id,
        uploadLimitMb: Number(process.env.UPLOAD_LIMIT_MB) || 5,
      });
    } catch {}
    avatarSingle(req, res, (err) => {
      if (err) {
        const payload = {
          code: err?.code,
          message: err?.message,
          name: err?.name,
        };
        console.error("[upload/avatar] multer error", payload);
        if (err.code === "LIMIT_FILE_SIZE") {
          const limitMb = Number(process.env.UPLOAD_LIMIT_MB) || 5;
          return res.status(413).json({ error: "FILE_TOO_LARGE", limitMb });
        }
        return res
          .status(400)
          .json({ error: "UPLOAD_FAILED", reason: err.message || String(err) });
      }
      return next();
    });
  },
  async (req, res) => {
    const prisma = req.app.locals.prisma;
    try {
      if (!req.file) {
        console.warn("[upload/avatar] no file received after multer");
        return res.status(400).json({ error: "NO_FILE" });
      }
      try {
        console.log("[upload/avatar] saved", {
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
          destination: req.file.destination,
          path: req.file.path,
        });
      } catch {}

      const relPath = ["avatars", req.file.filename].join("/");
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { avatarPath: relPath },
      });
      req.user = publicUser(user);
      res.json({ avatarPath: relPath });
    } catch (err) {
      console.error("[upload/avatar] handler error", err);
      res.status(500).json({ error: "AVATAR_UPLOAD_FAILED" });
    }
  }
);

export default router;
