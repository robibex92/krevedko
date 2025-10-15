import { Router } from "express";
import { asyncHandler } from "../../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { paymentUploadBase } from "../../../services/uploads.js";

export function createAdminOrderRoutes(container) {
  const router = Router();
  const orderController = container.resolve("orderController");

  // All routes require auth and admin
  router.use(requireAuth, requireAdmin);

  router.get("/orders", asyncHandler(orderController.getAllOrders));
  router.patch(
    "/orders/:id/status",
    asyncHandler(orderController.updateOrderStatus)
  );
  router.patch(
    "/orders/:id/delivery",
    asyncHandler(orderController.updateOrderDelivery)
  );
  router.post(
    "/orders/:id/payment-proof",
    paymentUploadBase.single("image"),
    async (req, res) => {
      const orderId = Number(req.params.id);

      if (!req.file) {
        return res.status(400).json({ error: "NO_FILE" });
      }

      const { note } = req.body || {};
      const relPath = ["payments", req.file.filename].join("/");

      const proof = await req.app.locals.prisma.paymentProof.create({
        data: {
          orderId,
          imagePath: relPath,
          note: note || null,
        },
      });

      res.status(201).json({ proof });
    }
  );

  return router;
}
