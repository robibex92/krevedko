import {
  BusinessLogicError,
  ValidationError,
} from "../core/errors/AppError.js";
import { dec, isMultipleOf } from "../core/utils/decimal.js";
import { COLLECTION_STATUS } from "../constants/index.js";

export class CartService {
  constructor(
    cartRepository,
    productRepository,
    collectionRepository,
    pricingService
  ) {
    this.cartRepo = cartRepository;
    this.productRepo = productRepository;
    this.collectionRepo = collectionRepository;
    this.pricingService = pricingService;
  }

  /**
   * Get user cart
   */
  async getUserCart(userId, collectionIds = null) {
    // Get active collections
    let collections;
    if (collectionIds && collectionIds.length > 0) {
      collections = await this.collectionRepo.findMany({
        id: { in: collectionIds },
        status: "ACTIVE",
      });
    } else {
      collections = await this.collectionRepo.findActive();
    }

    if (!collections.length) {
      return {
        collections: [],
        totalKopecks: 0,
      };
    }

    // Get cart for each collection
    const collectionsData = [];
    let grandTotal = dec(0);

    for (const collection of collections) {
      const items = await this.cartRepo.findByUserAndCollection(
        userId,
        collection.id
      );

      const mappedItems = [];
      let collectionTotal = dec(0);

      for (const item of items) {
        const product = item.product;
        const pricing = await this.pricingService.getProductPricing(
          product.id,
          collection.id
        );

        // Calculate subtotal
        const quantity = dec(item.quantityDecimal.toString());
        const step = dec(pricing.step.toString());
        const steps = quantity.div(step);
        const subtotal = dec(pricing.price).mul(steps);

        // Mark unavailable items as inactive
        if (!pricing.isAvailable && item.isActive) {
          await this.cartRepo.update(item.id, { isActive: false });
        }

        mappedItems.push({
          id: item.id,
          productId: product.id,
          title: product.title,
          unitLabel: product.unitLabel,
          quantityDecimal: quantity.toString(),
          unitPriceKopecks: pricing.price,
          subtotalKopecks: subtotal.toNumber(),
          imagePath: product.imagePath,
          collectionId: collection.id,
          category: product.category,
          stepDecimal: pricing.step.toString(),
          isAvailable: pricing.isAvailable,
          displayStockHint: pricing.displayStockHint,
        });

        if (pricing.isAvailable) {
          collectionTotal = collectionTotal.add(subtotal);
          grandTotal = grandTotal.add(subtotal);
        }
      }

      collectionsData.push({
        collection: {
          id: collection.id,
          title: collection.title,
          startsAt: collection.startsAt,
          endsAt: collection.endsAt,
        },
        items: mappedItems,
        totalKopecks: collectionTotal.toNumber(),
      });
    }

    return {
      collections: collectionsData,
      totalKopecks: grandTotal.toNumber(),
    };
  }

  /**
   * Add item to cart
   */
  async addItem(userId, productId, quantity, collectionId) {
    // Validate collection
    const collection = await this.collectionRepo.findByIdOrFail(collectionId);
    if (collection.status !== COLLECTION_STATUS.ACTIVE) {
      throw new BusinessLogicError(
        "Collection is not active",
        "COLLECTION_NOT_ACTIVE"
      );
    }

    // Get product pricing
    const pricing = await this.pricingService.getProductPricing(
      productId,
      collectionId
    );

    if (!pricing.isAvailable) {
      throw new BusinessLogicError(
        "Product is not available",
        "PRODUCT_NOT_AVAILABLE"
      );
    }

    // Validate quantity
    const quantityStr = String(quantity);
    const stepStr = pricing.step.toString();

    if (!isMultipleOf(quantityStr, stepStr)) {
      throw new ValidationError(`Quantity must be multiple of ${stepStr}`, {
        step: stepStr,
      });
    }

    // Validate price calculation
    const steps = dec(quantityStr).div(dec(stepStr));
    const subtotal = dec(pricing.price).mul(steps);

    if (!subtotal.mod(1).eq(0)) {
      throw new BusinessLogicError(
        "Price calculation error",
        "PRICE_STEP_MISMATCH"
      );
    }

    // Add to cart
    return this.cartRepo.upsertItem(
      userId,
      collectionId,
      productId,
      quantityStr,
      pricing.price
    );
  }

  /**
   * Update cart item quantity
   */
  async updateItemQuantity(itemId, userId, quantity) {
    // Find cart item
    const cartItem = await this.cartRepo.findOne(
      { id: itemId, userId },
      {
        include: { product: true, collection: true },
      }
    );

    if (!cartItem) {
      throw new BusinessLogicError(
        "Cart item not found",
        "CART_ITEM_NOT_FOUND"
      );
    }

    // Validate collection
    if (cartItem.collection.status !== "ACTIVE") {
      throw new BusinessLogicError(
        "Collection is not active",
        "COLLECTION_NOT_ACTIVE"
      );
    }

    // Get product pricing
    const pricing = await this.pricingService.getProductPricing(
      cartItem.productId,
      cartItem.collectionId
    );

    if (!pricing.isAvailable) {
      throw new BusinessLogicError(
        "Product is not available",
        "PRODUCT_NOT_AVAILABLE"
      );
    }

    // Validate quantity
    const quantityStr = String(quantity);
    const stepStr = pricing.step.toString();

    if (!isMultipleOf(quantityStr, stepStr)) {
      throw new ValidationError(`Quantity must be multiple of ${stepStr}`, {
        step: stepStr,
      });
    }

    // Update cart item
    return this.cartRepo.update(itemId, {
      quantityDecimal: quantityStr,
      unitPriceKopecks: pricing.price,
    });
  }

  /**
   * Remove item from cart
   */
  async removeItem(itemId, userId) {
    const cartItem = await this.cartRepo.findOne({ id: itemId, userId });

    if (!cartItem) {
      throw new BusinessLogicError(
        "Cart item not found",
        "CART_ITEM_NOT_FOUND"
      );
    }

    return this.cartRepo.delete(itemId);
  }

  /**
   * Clear user cart for collection
   */
  async clearCart(userId, collectionId) {
    return this.cartRepo.clearCart(userId, collectionId);
  }

  /**
   * Get cart count
   */
  async getCartCount(userId, collectionIds = null) {
    return this.cartRepo.countByUser(userId, collectionIds);
  }

  /**
   * Check if user has saved cart
   */
  async hasSavedCart(userId) {
    const count = await this.cartRepo.countByUser(userId);
    return count > 0;
  }
}
