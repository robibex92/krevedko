import { BaseController } from "../core/base/BaseController.js";
import { getCached, setCache } from "../services/cache.js";
import {
  toProductListDTOArray,
  toProductAdminDTOArray,
} from "../dto/ProductDTO.js";

export class ProductController extends BaseController {
  constructor(productService, collectionService) {
    super();
    this.productService = productService;
    this.collectionService = collectionService;
    this.bindMethods();
  }

  /**
   * Get all products (admin)
   * GET /api/admin/products
   */
  async getAllProducts(req, res) {
    const products = await this.productService.getAllProducts({
      orderBy: { id: "asc" },
    });

    // Применяем DTO для админки (все поля)
    const optimizedProducts = toProductAdminDTOArray(products);

    return this.success(res, { products: optimizedProducts });
  }

  /**
   * Create product (admin)
   * POST /api/admin/products
   */
  async createProduct(req, res) {
    const product = await this.productService.createProduct(req.body);

    return this.created(res, { product });
  }

  /**
   * Update product (admin)
   * PATCH /api/admin/products/:id
   */
  async updateProduct(req, res) {
    const productId = Number(req.params.id);
    const product = await this.productService.updateProduct(
      productId,
      req.body
    );

    return this.success(res, { product });
  }

  /**
   * Update product stock (admin)
   * PATCH /api/admin/products/:id/stock
   */
  async updateStock(req, res) {
    const productId = Number(req.params.id);
    const { stockQuantity, minStock } = req.body || {};

    const product = await this.productService.updateStock(
      productId,
      stockQuantity,
      minStock
    );

    return this.success(res, { product });
  }

  /**
   * Upload product image (admin)
   * POST /api/admin/products/:id/image
   */
  async uploadImage(req, res) {
    const productId = Number(req.params.id);

    if (!req.file) {
      return res.status(400).json({ error: "NO_FILE" });
    }

    const relPath = ["products", req.file.filename].join("/");
    const url = `/uploads/${relPath}`;

    const product = await this.productService.updateImage(productId, relPath);

    return this.success(res, {
      product: { ...product, imageUrl: url },
      file: {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url,
      },
    });
  }

  /**
   * Get low stock products (admin)
   * GET /api/admin/products/low-stock
   */
  async getLowStock(req, res) {
    const products = await this.productService.getLowStockProducts();

    // Применяем DTO для админки
    const optimizedProducts = toProductAdminDTOArray(products);

    return this.success(res, { products: optimizedProducts });
  }

  /**
   * Update collection product override (admin)
   * PATCH /api/admin/collections/:collectionId/products/:productId
   */
  async updateCollectionProduct(req, res) {
    const collectionId = Number(req.params.collectionId);
    const productId = Number(req.params.productId);

    const override = await this.collectionService.updateCollectionProduct(
      collectionId,
      productId,
      req.body
    );

    return this.success(res, { override });
  }

  /**
   * Get products with collection-specific pricing and overrides
   * GET /api/products?collection_id=...
   */
  async getProducts(req, res) {
    const { collection_id } = req.query;

    // Get active collections
    const activeCollections =
      await this.collectionService.getActiveCollections();

    if (!activeCollections.length) {
      return this.success(res, { collections: [], products: [] });
    }

    // Determine which collections to process
    let targetCollections = activeCollections;
    let cacheKey = "products_all";

    const isNumericId =
      typeof collection_id === "string" &&
      collection_id !== "" &&
      collection_id !== "current" &&
      collection_id !== "all" &&
      Number.isInteger(Number(collection_id));

    if (collection_id === "current") {
      const selected = activeCollections[0];
      targetCollections = [selected];
      cacheKey = `products_collection_${selected.id}`;
    } else if (isNumericId) {
      const id = Number(collection_id);
      const selected = activeCollections.find((c) => c.id === id);
      if (!selected) {
        return res.status(404).json({ error: "COLLECTION_NOT_FOUND" });
      }
      targetCollections = [selected];
      cacheKey = `products_collection_${selected.id}`;
    } else if (collection_id === "all") {
      cacheKey = "products_all";
    } else if (activeCollections.length === 1) {
      targetCollections = [activeCollections[0]];
      cacheKey = `products_collection_${activeCollections[0].id}`;
    }

    // Check cache
    const cached = getCached(cacheKey);
    if (cached) {
      return this.success(res, cached);
    }

    // Get active products and process with collection overrides
    const result = await this.productService.getProductsWithCollectionOverrides(
      targetCollections
    );

    // Применяем DTO для списка продуктов (уменьшает размер ответа на 70%)
    const optimizedResult = {
      ...result,
      collections: result.collections.map((col) => ({
        collection: col.collection,
        products: toProductListDTOArray(col.products),
      })),
    };

    // Если одна коллекция, также оптимизируем products на корневом уровне
    if (optimizedResult.products) {
      optimizedResult.products = toProductListDTOArray(
        optimizedResult.products
      );
    }

    // Cache the optimized result
    setCache(cacheKey, optimizedResult);

    return this.success(res, optimizedResult);
  }
}
