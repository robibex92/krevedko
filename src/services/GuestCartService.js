import {
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} from "../core/errors/AppError.js";
import { Decimal } from "decimal.js";

/**
 * Service for managing guest (unauthenticated) shopping carts
 * Uses sessionId instead of userId
 */
export class GuestCartService {
  constructor(cartRepository, productRepository, pricingService, prisma) {
    this.cartRepo = cartRepository;
    this.productRepo = productRepository;
    this.pricingService = pricingService;
    this.prisma = prisma;
  }

  /**
   * Get guest cart by sessionId
   */
  async getGuestCart(sessionId) {
    if (!sessionId) {
      throw new ValidationError("sessionId is required");
    }

    const cartItems = await this.prisma.cartItem.findMany({
      where: {
        sessionId,
        isActive: true,
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            imagePath: true,
            unitLabel: true,
            stepDecimal: true,
            priceKopecks: true,
            isActive: true,
            stockQuantity: true,
            category: true,
          },
        },
        collection: {
          select: {
            id: true,
            title: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group items by collection to match the format expected by frontend
    const collectionsMap = new Map();
    let grandTotal = 0;

    for (const item of cartItems) {
      const collectionId = item.collectionId;

      if (!collectionsMap.has(collectionId)) {
        collectionsMap.set(collectionId, {
          collection: item.collection,
          items: [],
        });
      }

      const collectionData = collectionsMap.get(collectionId);
      const subtotal =
        item.unitPriceKopecks * parseFloat(item.quantityDecimal.toString());
      grandTotal += subtotal;

      collectionData.items.push({
        id: item.id,
        productId: item.product.id,
        title: item.product.title,
        unitLabel: item.product.unitLabel,
        quantityDecimal: item.quantityDecimal.toString(),
        unitPriceKopecks: item.unitPriceKopecks,
        subtotalKopecks: Math.round(subtotal),
        imagePath: item.product.imagePath,
        collectionId: item.collectionId,
        category: item.product.category,
        stepDecimal: item.product.stepDecimal?.toString() || "1",
        isAvailable: item.product.isActive,
        displayStockHint: null,
      });
    }

    const collections = Array.from(collectionsMap.values());

    return {
      collections,
      totalKopecks: Math.round(grandTotal),
      count: cartItems.length,
    };
  }

  /**
   * Add item to guest cart
   */
  async addItemToGuestCart(sessionId, productId, collectionId, quantity) {
    if (!sessionId) {
      throw new ValidationError("sessionId is required");
    }

    if (!productId) {
      throw new ValidationError("productId is required");
    }

    if (!collectionId) {
      throw new ValidationError("collectionId is required");
    }

    // Преобразуем в числа
    const numericProductId = Number(productId);
    const numericCollectionId = Number(collectionId);

    if (isNaN(numericProductId)) {
      throw new ValidationError(`Invalid productId: ${productId}`);
    }

    if (isNaN(numericCollectionId)) {
      throw new ValidationError(`Invalid collectionId: ${collectionId}`);
    }

    console.log("[GuestCartService] addItemToGuestCart called with:", {
      sessionId,
      productId,
      numericProductId,
      collectionId,
      numericCollectionId,
      quantity,
    });

    // Get pricing
    let pricing;
    try {
      pricing = await this.pricingService.getProductPricing(
        numericProductId,
        numericCollectionId
      );
      console.log("[GuestCartService] Pricing result:", pricing);
    } catch (pricingError) {
      console.error("[GuestCartService] Pricing error:", pricingError);
      throw new BusinessLogicError(
        `Failed to get product pricing: ${pricingError.message}`,
        "PRICING_ERROR"
      );
    }

    if (!pricing.isAvailable) {
      throw new BusinessLogicError(
        "Product is not available",
        "PRODUCT_NOT_AVAILABLE"
      );
    }

    // Проверяем, что цена определена
    if (pricing.price === undefined || pricing.price === null) {
      console.error("[GuestCartService] Pricing.price is undefined:", pricing);
      throw new BusinessLogicError(
        "Product price is not available",
        "PRICE_NOT_AVAILABLE"
      );
    }

    console.log("[GuestCartService] Using price:", pricing.price);

    // Check if item already exists
    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        sessionId,
        productId: numericProductId,
        collectionId: numericCollectionId,
        isActive: true,
      },
    });

    if (existingItem) {
      // Update quantity
      const newQuantity = new Decimal(existingItem.quantityDecimal).plus(
        new Decimal(quantity)
      );

      return await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantityDecimal: newQuantity,
          unitPriceKopecks: pricing.price,
        },
        include: {
          product: true,
          collection: true,
        },
      });
    }

    // Create new cart item
    return await this.prisma.cartItem.create({
      data: {
        sessionId,
        productId: numericProductId,
        collectionId: numericCollectionId,
        quantityDecimal: new Decimal(quantity),
        unitPriceKopecks: pricing.price,
        isActive: true,
      },
      include: {
        product: true,
        collection: true,
      },
    });
  }

  /**
   * Update guest cart item quantity
   */
  async updateGuestCartItem(sessionId, itemId, quantity) {
    if (!sessionId) {
      throw new ValidationError("sessionId is required");
    }

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        sessionId,
        isActive: true,
      },
    });

    if (!item) {
      throw new NotFoundError("Cart item not found", "CART_ITEM_NOT_FOUND");
    }

    // Update quantity
    return await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantityDecimal: new Decimal(quantity),
      },
      include: {
        product: true,
        collection: true,
      },
    });
  }

  /**
   * Remove item from guest cart
   */
  async removeGuestCartItem(sessionId, itemId) {
    if (!sessionId) {
      throw new ValidationError("sessionId is required");
    }

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        sessionId,
        isActive: true,
      },
    });

    if (!item) {
      throw new NotFoundError("Cart item not found", "CART_ITEM_NOT_FOUND");
    }

    // Soft delete
    return await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
  }

  /**
   * Clear guest cart
   */
  async clearGuestCart(sessionId) {
    if (!sessionId) {
      throw new ValidationError("sessionId is required");
    }

    return await this.prisma.cartItem.updateMany({
      where: {
        sessionId,
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  /**
   * Merge guest cart into user cart (after login/registration)
   */
  async mergeGuestCartIntoUserCart(sessionId, userId) {
    if (!sessionId || !userId) {
      throw new ValidationError("sessionId and userId are required");
    }

    const guestItems = await this.prisma.cartItem.findMany({
      where: {
        sessionId,
        isActive: true,
      },
    });

    if (guestItems.length === 0) {
      return { merged: 0, skipped: 0 };
    }

    let merged = 0;
    let skipped = 0;

    // Merge each guest item
    for (const guestItem of guestItems) {
      try {
        // Check if user already has this product in cart
        const userItem = await this.prisma.cartItem.findFirst({
          where: {
            userId,
            productId: guestItem.productId,
            collectionId: guestItem.collectionId,
            isActive: true,
          },
        });

        if (userItem) {
          // Combine quantities
          const newQuantity = new Decimal(userItem.quantityDecimal).plus(
            new Decimal(guestItem.quantityDecimal)
          );

          await this.prisma.cartItem.update({
            where: { id: userItem.id },
            data: { quantityDecimal: newQuantity },
          });

          // Deactivate guest item
          await this.prisma.cartItem.update({
            where: { id: guestItem.id },
            data: { isActive: false },
          });

          merged++;
        } else {
          // Transfer guest item to user
          await this.prisma.cartItem.update({
            where: { id: guestItem.id },
            data: {
              userId,
              sessionId: null, // Clear sessionId
            },
          });

          merged++;
        }
      } catch (error) {
        console.error(
          `[GuestCartService] Failed to merge item ${guestItem.id}:`,
          error
        );
        skipped++;
      }
    }

    return { merged, skipped, total: guestItems.length };
  }

  /**
   * Get cart count for guest
   */
  async getGuestCartCount(sessionId) {
    if (!sessionId) {
      return { count: 0 };
    }

    const count = await this.prisma.cartItem.count({
      where: {
        sessionId,
        isActive: true,
      },
    });

    return { count };
  }
}
