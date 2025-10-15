import {
  BusinessLogicError,
  ValidationError,
} from "../core/errors/AppError.js";
import { validateRequired } from "../core/validators/index.js";

export class ProductService {
  constructor(
    productRepository,
    inventoryService,
    collectionRepository,
    telegramBotService,
    prisma
  ) {
    this.productRepo = productRepository;
    this.inventoryService = inventoryService;
    this.collectionRepo = collectionRepository;
    this.telegramBotService = telegramBotService;
    this.prisma = prisma;
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

    const product = await this.productRepo.create(productData);

    // Send to Telegram if category is set
    if (product.category && this.telegramBotService && this.prisma) {
      try {
        const category = await this.prisma.category.findUnique({
          where: { name: product.category, isActive: true },
        });

        if (category) {
          await this.telegramBotService.enqueueMessage("product_create", {
            productId: product.id,
            categoryId: category.id,
          });
        }

        // Send to quick pickup chat if canPickupNow is true
        if (product.canPickupNow) {
          await this.telegramBotService.enqueueMessage("quick_pickup_add", {
            productId: product.id,
          });
        }
      } catch (error) {
        console.error("Failed to enqueue product telegram message:", error);
      }
    }

    return product;
  }

  /**
   * Update product
   */
  async updateProduct(productId, data) {
    const oldProduct = await this.productRepo.findByIdOrFail(productId);

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

    const product = await this.productRepo.update(productId, updateData);

    // Handle Telegram notifications
    if (this.telegramBotService && this.prisma) {
      try {
        // If product was deactivated, mark as removed
        if (data.isActive === false && oldProduct.isActive === true) {
          await this.telegramBotService.enqueueMessage("product_remove", {
            productId: product.id,
          });
        }
        // Handle category change
        else if (
          data.category !== undefined &&
          oldProduct.category !== product.category
        ) {
          // Remove from old category if it existed
          if (oldProduct.category) {
            const oldCategory = await this.prisma.category.findUnique({
              where: { name: oldProduct.category, isActive: true },
            });
            if (oldCategory) {
              await this.telegramBotService.enqueueMessage("product_remove", {
                productId: product.id,
              });
            }
          }

          // Add to new category if product is active
          if (product.isActive && product.category) {
            const newCategory = await this.prisma.category.findUnique({
              where: { name: product.category, isActive: true },
            });
            if (newCategory) {
              await this.telegramBotService.enqueueMessage("product_create", {
                productId: product.id,
                categoryId: newCategory.id,
              });
            }
          }
        }
        // If product is active and has category, update message (no category change)
        else if (
          product.isActive &&
          product.category &&
          oldProduct.category === product.category
        ) {
          const category = await this.prisma.category.findUnique({
            where: { name: product.category, isActive: true },
          });

          if (category) {
            await this.telegramBotService.enqueueMessage("product_update", {
              productId: product.id,
              categoryId: category.id,
            });
          }
        }

        // Handle quick pickup changes
        const wasQuickPickup = oldProduct.canPickupNow;
        const isQuickPickup = product.canPickupNow;

        if (!wasQuickPickup && isQuickPickup) {
          await this.telegramBotService.enqueueMessage("quick_pickup_add", {
            productId: product.id,
          });
        } else if (wasQuickPickup && !isQuickPickup) {
          await this.telegramBotService.enqueueMessage("quick_pickup_remove", {
            productId: product.id,
          });
        }
      } catch (error) {
        console.error(
          "Failed to enqueue product update telegram message:",
          error
        );
      }
    }

    return product;
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
    const product = await this.productRepo.updateImage(productId, imagePath);

    // Update Telegram message with new image
    if (
      product.isActive &&
      product.category &&
      this.telegramBotService &&
      this.prisma
    ) {
      try {
        const category = await this.prisma.category.findUnique({
          where: { name: product.category, isActive: true },
        });

        if (category) {
          await this.telegramBotService.enqueueMessage("product_update", {
            productId: product.id,
            categoryId: category.id,
          });
        }
      } catch (error) {
        console.error(
          "Failed to enqueue product image update telegram message:",
          error
        );
      }
    }

    return product;
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

  /**
   * Delete product completely (admin)
   * Removes from all Telegram chats and database
   */
  async deleteProduct(productId) {
    // 1. Удаляем из всех Telegram чатов
    await this.telegramBotService.enqueueMessage("product_remove", {
      productId: productId,
    });

    // 2. Удаляем из чата быстрых продаж
    await this.telegramBotService.enqueueMessage("quick_pickup_remove", {
      productId: productId,
    });

    // 3. Удаляем из базы данных
    const deletedProduct = await this.productRepo.delete(productId);

    return {
      message: "Product deleted successfully",
      product: deletedProduct,
      telegramMessagesRemoved: true,
      quickPickupRemoved: true,
    };
  }
}
