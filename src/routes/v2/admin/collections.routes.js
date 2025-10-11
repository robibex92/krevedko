import { Router } from "express";
import { asyncHandler } from "../../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";

export function createAdminCollectionRoutes(container) {
  const router = Router();
  const collectionController = container.resolve("collectionController");
  const productController = container.resolve("productController");

  // All routes require auth and admin
  router.use(requireAuth, requireAdmin);

  router.get(
    "/collections",
    asyncHandler(collectionController.getAllCollections)
  );
  router.post(
    "/collections",
    asyncHandler(collectionController.createCollection)
  );
  router.patch(
    "/collections/:id",
    asyncHandler(collectionController.updateCollection)
  );
  router.patch(
    "/collections/:id/activate",
    asyncHandler(collectionController.activateCollection)
  );
  router.patch(
    "/collections/:id/close",
    asyncHandler(collectionController.closeCollection)
  );
  router.patch(
    "/collections/:collectionId/products/:productId",
    asyncHandler(productController.updateCollectionProduct)
  );

  return router;
}
