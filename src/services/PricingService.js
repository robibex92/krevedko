import { dec } from "../core/utils/decimal.js";

export class PricingService {
  constructor(productRepository, collectionRepository) {
    this.productRepo = productRepository;
    this.collectionRepo = collectionRepository;
  }

  /**
   * Get product pricing for collection
   */
  async getProductPricing(productId, collectionId) {
    console.log("[PricingService] getProductPricing called:", {
      productId,
      productIdType: typeof productId,
      collectionId,
      collectionIdType: typeof collectionId,
    });

    const product = await this.productRepo.findById(productId);

    if (!product) {
      console.warn("[PricingService] Product not found:", { productId });
      return {
        isAvailable: false,
        price: 0,
        step: "1",
        displayStockHint: "OUT",
      };
    }

    // Get collection product override
    const override = await this.collectionRepo.findCollectionProduct(
      collectionId,
      productId
    );

    // Check availability
    const isOverrideActive = override?.isActive ?? true;
    const displayStockHint =
      override?.displayStockHint ?? product.displayStockHint;
    const isAvailable =
      product.isActive &&
      isOverrideActive !== false &&
      displayStockHint !== "OUT";

    // Get price and step
    const price = override?.priceOverrideKopecks ?? product.priceKopecks;
    const stepDecimal = override?.stepOverrideDecimal ?? product.stepDecimal;
    const step = stepDecimal ? stepDecimal.toString() : "1";

    return {
      isAvailable,
      price,
      step,
      displayStockHint: displayStockHint || null,
      override,
      product,
    };
  }

  /**
   * Calculate order total
   */
  calculateTotal(items) {
    let total = dec(0);

    for (const item of items) {
      const quantity = dec(item.quantityDecimal);
      const step = dec(item.stepDecimal || "1");
      const unitPrice = dec(item.unitPriceKopecks);

      const steps = quantity.div(step);
      const subtotal = unitPrice.mul(steps);

      total = total.add(subtotal);
    }

    return total.toNumber();
  }

  /**
   * Format price from kopecks
   */
  formatPrice(kopecks) {
    const rubles = dec(kopecks).div(100);
    return `${rubles.toFixed(2)} ₽`;
  }
}
