import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";

export function createCollectionRoutes(container) {
  const router = Router();
  const collectionController = container.resolve("collectionController");
  const productController = container.resolve("productController");

  router.get(
    "/collections/active",
    asyncHandler(collectionController.getActiveCollection)
  );

  router.get(
    "/collections",
    asyncHandler(collectionController.getActiveCollections)
  );

  router.get("/products", asyncHandler(productController.getProducts));

  return router;
}
