import { BaseRepository } from "../core/base/BaseRepository.js";

export class ProductRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "product");
  }

  /**
   * Find active products
   */
  async findActive(options = {}) {
    return this.findMany({ isActive: true }, options);
  }

  /**
   * Find by category
   */
  async findByCategory(category, options = {}) {
    return this.findMany({ category, isActive: true }, options);
  }

  /**
   * Find low stock products
   */
  async findLowStock() {
    const products = await this.prisma.$queryRaw`
      SELECT * FROM "Product"
      WHERE "isActive" = true
      AND "stockQuantity"::numeric <= "minStock"::numeric
      ORDER BY "stockQuantity"::numeric ASC
    `;
    return products;
  }

  /**
   * Update stock quantity
   */
  async updateStock(productId, quantity) {
    return this.update(productId, {
      stockQuantity: String(quantity),
    });
  }

  /**
   * Decrement stock
   */
  async decrementStock(productId, amount) {
    const product = await this.findByIdOrFail(productId);
    const { dec } = await import("../core/utils/decimal.js");

    const currentStock = dec(product.stockQuantity);
    const newStock = currentStock.sub(dec(amount));

    return this.updateStock(
      productId,
      newStock.lt(0) ? "0" : newStock.toString()
    );
  }

  /**
   * Increment stock
   */
  async incrementStock(productId, amount) {
    const product = await this.findByIdOrFail(productId);
    const { dec } = await import("../core/utils/decimal.js");

    const currentStock = dec(product.stockQuantity);
    const newStock = currentStock.add(dec(amount));

    return this.updateStock(productId, newStock.toString());
  }

  /**
   * Update image
   */
  async updateImage(productId, imagePath) {
    return this.update(productId, { imagePath });
  }

  /**
   * Search products
   */
  async search(query, options = {}) {
    const where = {
      isActive: true,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { searchKeywords: { contains: query, mode: "insensitive" } },
      ],
    };

    return this.findMany(where, options);
  }
}
