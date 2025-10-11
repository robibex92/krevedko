import { dec } from "../core/utils/decimal.js";
import { BusinessLogicError } from "../core/errors/AppError.js";

export class InventoryService {
  constructor(productRepository) {
    this.productRepo = productRepository;
  }

  /**
   * Check product availability
   */
  async checkAvailability(productId, requestedQuantity) {
    const product = await this.productRepo.findByIdOrFail(productId);

    const currentStock = dec(product.stockQuantity);
    const requested = dec(requestedQuantity);

    return {
      isAvailable: currentStock.gte(requested),
      currentStock: currentStock.toString(),
      requestedQuantity: requested.toString(),
    };
  }

  /**
   * Decrease stock
   */
  async decreaseStock(prismaOrTx, productId, amount) {
    const product = await prismaOrTx.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new BusinessLogicError("Product not found", "PRODUCT_NOT_FOUND");
    }

    const currentStock = dec(product.stockQuantity);
    const amountDec = dec(amount);
    const newStock = currentStock.sub(amountDec);

    // Don't allow negative stock
    const finalStock = newStock.lt(0) ? dec(0) : newStock;

    await prismaOrTx.product.update({
      where: { id: productId },
      data: {
        stockQuantity: finalStock.toString(),
      },
    });

    return finalStock.toString();
  }

  /**
   * Increase stock
   */
  async increaseStock(prismaOrTx, productId, amount) {
    const product = await prismaOrTx.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new BusinessLogicError("Product not found", "PRODUCT_NOT_FOUND");
    }

    const currentStock = dec(product.stockQuantity);
    const amountDec = dec(amount);
    const newStock = currentStock.add(amountDec);

    await prismaOrTx.product.update({
      where: { id: productId },
      data: {
        stockQuantity: newStock.toString(),
      },
    });

    return newStock.toString();
  }

  /**
   * Update stock quantity
   */
  async updateStock(productId, newQuantity) {
    return this.productRepo.updateStock(productId, newQuantity);
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts() {
    return this.productRepo.findLowStock();
  }

  /**
   * Check if product is low stock
   */
  async isLowStock(productId) {
    const product = await this.productRepo.findByIdOrFail(productId);

    const currentStock = dec(product.stockQuantity);
    const minStock = dec(product.minStock);

    return currentStock.lte(minStock);
  }
}
