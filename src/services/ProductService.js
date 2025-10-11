import {
  BusinessLogicError,
  ValidationError,
} from "../core/errors/AppError.js";
import { validateRequired } from "../core/validators/index.js";

export class ProductService {
  constructor(productRepository, inventoryService, collectionRepository) {
    this.productRepo = productRepository;
    this.inventoryService = inventoryService;
    this.collectionRepo = collectionRepository;
  }

  /**
   * Get all products
   */
  async getAllProducts(options = {}) {
    return this.productRepo.findMany({}, options);
  }

  /**
   * Get active products
   */
  async getActiveProducts(options = {}) {
    return this.productRepo.findActive(options);
  }

  /**
   * Get product by ID
   */
  async getProduct(productId) {
    return this.productRepo.findByIdOrFail(productId);
  }

  /**
   * Search products
   */
  async searchProducts(query, options = {}) {
    if (!query || query.trim().length < 2) {
      throw new ValidationError("Search query must be at least 2 characters");
    }
    return this.productRepo.search(query.trim(), options);
  }

  /**
   * Get products by category
   */
  async getProductsByCategory(category, options = {}) {
    return this.productRepo.findByCategory(category, options);
  }

  /**
   * Create product
   */
  async createProduct(data) {
    // Validate required fields
    validateRequired(data, [
      "title",
      "unitLabel",
      "stepDecimal",
      "priceKopecks",
    ]);

    // Validate numeric fields
    if (data.stepDecimal <= 0) {
      throw new ValidationError("stepDecimal must be positive");
    }

    if (data.priceKopecks < 0) {
      throw new ValidationError("priceKopecks cannot be negative");
    }

    // Prepare data
    const productData = {
      title: data.title.trim(),
      description: data.description?.trim() || "",
      category: data.category?.trim() || null,
      unitLabel: data.unitLabel.trim(),
      stepDecimal: String(data.stepDecimal),
      priceKopecks: Number(data.priceKopecks),
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      stockQuantity: data.stockQuantity ? String(data.stockQuantity) : "0",
      minStock: data.minStock ? String(data.minStock) : "0",
      tags: data.tags ? JSON.stringify(data.tags) : null,
      searchKeywords: data.searchKeywords?.trim() || null,
      displayStockHint: data.displayStockHint || null,
      canPickupNow:
        data.canPickupNow !== undefined ? Boolean(data.canPickupNow) : false,
    };

    return this.productRepo.create(productData);
  }

  /**
   * Update product
   */
  async updateProduct(productId, data) {
    await this.productRepo.findByIdOrFail(productId);

    const updateData = {};

    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined)
      updateData.description = data.description?.trim() || "";
    if (data.category !== undefined)
      updateData.category = data.category?.trim() || null;
    if (data.unitLabel !== undefined)
      updateData.unitLabel = data.unitLabel.trim();
    if (data.stepDecimal !== undefined) {
      if (data.stepDecimal <= 0) {
        throw new ValidationError("stepDecimal must be positive");
      }
      updateData.stepDecimal = String(data.stepDecimal);
    }
    if (data.priceKopecks !== undefined) {
      if (data.priceKopecks < 0) {
        throw new ValidationError("priceKopecks cannot be negative");
      }
      updateData.priceKopecks = Number(data.priceKopecks);
    }
    if (data.isActive !== undefined)
      updateData.isActive = Boolean(data.isActive);
    if (data.displayStockHint !== undefined) {
      updateData.displayStockHint = data.displayStockHint || null;
    }
    if (data.canPickupNow !== undefined)
      updateData.canPickupNow = Boolean(data.canPickupNow);
    if (data.tags !== undefined) {
      updateData.tags =
        Array.isArray(data.tags) && data.tags.length
          ? JSON.stringify(data.tags)
          : null;
    }
    if (data.searchKeywords !== undefined) {
      updateData.searchKeywords = data.searchKeywords?.trim() || null;
    }

    return this.productRepo.update(productId, updateData);
  }

  /**
   * Update product stock
   */
  async updateStock(productId, stockQuantity, minStock = null) {
    const product = await this.productRepo.findByIdOrFail(productId);

    const updateData = {
      stockQuantity: String(stockQuantity),
    };

    if (minStock !== null) {
      updateData.minStock = String(minStock);
    }

    return this.productRepo.update(productId, updateData);
  }

  /**
   * Update product image
   */
  async updateImage(productId, imagePath) {
    await this.productRepo.findByIdOrFail(productId);
    return this.productRepo.updateImage(productId, imagePath);
  }

  /**
   * Delete product
   */
  async deleteProduct(productId) {
    // Check if product can be deleted
    // In production, you might want to soft delete or check for dependencies
    return this.productRepo.delete(productId);
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts() {
    return this.inventoryService.getLowStockProducts();
  }

  /**
   * Get products with collection-specific overrides
   * @param {Array} targetCollections - Collections to get products for
   * @returns {Object} - Formatted response with collections and products
   */
  async getProductsWithCollectionOverrides(targetCollections) {
    // Get all active products
    const activeProducts = await this.productRepo.findActive({
      orderBy: { id: "asc" },
    });

    const collectionsPayload = [];

    for (const col of targetCollections) {
      // Get overrides for this collection
      const overrides =
        await this.collectionRepo.prisma.collectionProduct.findMany({
          where: { collectionId: col.id },
        });

      const overrideByProductId = new Map(
        overrides.map((cp) => [cp.productId, cp])
      );

      // Map products with overrides
      const products = activeProducts
        .map((product) => {
          const cp = overrideByProductId.get(product.id);

          // Skip if product is inactive in this collection
          if (cp?.isActive === false) return null;

          const stepDecimal = cp?.stepOverrideDecimal ?? product.stepDecimal;
          const priceKopecks = cp?.priceOverrideKopecks ?? product.priceKopecks;
          const displayStockHint =
            cp?.displayStockHint || product.displayStockHint || null;

          let tags = null;
          if (product.tags) {
            try {
              tags = JSON.parse(product.tags);
            } catch {
              tags = null;
            }
          }

          return {
            id: product.id,
            title: product.title,
            description: product.description,
            category: product.category,
            imagePath: product.imagePath,
            unitLabel: product.unitLabel,
            stepDecimal:
              stepDecimal && typeof stepDecimal.toString === "function"
                ? stepDecimal.toString()
                : String(stepDecimal ?? ""),
            priceKopecks: Number(priceKopecks),
            stockQuantity:
              product.stockQuantity &&
              typeof product.stockQuantity.toString === "function"
                ? product.stockQuantity.toString()
                : String(product.stockQuantity ?? ""),
            minStock:
              product.minStock &&
              typeof product.minStock.toString === "function"
                ? product.minStock.toString()
                : String(product.minStock ?? ""),
            stockOverride:
              cp?.stockOverride != null
                ? typeof cp.stockOverride.toString === "function"
                  ? cp.stockOverride.toString()
                  : String(cp.stockOverride)
                : null,
            displayStockHint,
            canPickupNow: Boolean(product.canPickupNow),
            isAvailable:
              product.isActive &&
              cp?.isActive !== false &&
              displayStockHint !== "OUT",
            tags,
            searchKeywords: product.searchKeywords,
            collectionId: col.id,
          };
        })
        .filter(Boolean);

      collectionsPayload.push({
        collection: {
          id: col.id,
          title: col.title,
          startsAt: col.startsAt,
          endsAt: col.endsAt,
          status: col.status,
        },
        products,
      });
    }

    const response = { collections: collectionsPayload };

    // If single collection, also include products at root level
    if (collectionsPayload.length === 1) {
      response.products = collectionsPayload[0].products;
      response.collectionId = collectionsPayload[0].collection.id;
    }

    return response;
  }
}
