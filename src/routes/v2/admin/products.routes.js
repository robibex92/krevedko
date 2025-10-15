import { Router } from "express";
import { asyncHandler } from "../../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { productUploadBase } from "../../../services/uploads.js";

export function createAdminProductRoutes(container) {
  const router = Router();
  const productController = container.resolve("productController");

  // All routes require auth and admin
  router.use(requireAuth, requireAdmin);

  router.get("/products", asyncHandler(productController.getAllProducts));
  router.post("/products", asyncHandler(productController.createProduct));
  router.patch("/products/:id", asyncHandler(productController.updateProduct));
  router.patch(
    "/products/:id/stock",
    asyncHandler(productController.updateStock)
  );
  router.post(
    "/products/:id/image",
    productUploadBase.single("image"),
    asyncHandler(productController.uploadImage)
  );
  router.get(
    "/products/low-stock",
    asyncHandler(productController.getLowStock)
  );

  return router;
}
