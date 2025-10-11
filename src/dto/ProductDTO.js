/**
 * Product DTO (Data Transfer Object) transformers
 * Different views for different use cases to reduce response size
 */

/**
 * Product list view - краткая версия для списков
 * Use: GET /api/products
 * Size: ~1.8 KB per product
 */
export function toProductListDTO(product) {
  return {
    id: product.id,
    title: product.title,
    priceKopecks: product.priceKopecks,
    imagePath: product.imagePath,
    unitLabel: product.unitLabel,
    stepDecimal: product.stepDecimal?.toString() || product.stepDecimal,
    displayStockHint: product.displayStockHint,
    canPickupNow: Boolean(product.canPickupNow),
    category: product.category,
    isAvailable: product.isAvailable !== undefined ? product.isAvailable : true,
  };
}

/**
 * Product detail view - полная версия
 * Use: GET /api/products/:id
 * Size: ~3 KB per product
 */
export function toProductDetailDTO(product) {
  let tags = null;
  if (product.tags) {
    try {
      tags =
        typeof product.tags === "string"
          ? JSON.parse(product.tags)
          : product.tags;
    } catch {
      tags = null;
    }
  }

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    priceKopecks: product.priceKopecks,
    imagePath: product.imagePath,
    unitLabel: product.unitLabel,
    stepDecimal: product.stepDecimal?.toString() || product.stepDecimal,
    stockQuantity: product.stockQuantity?.toString() || product.stockQuantity,
    minStock: product.minStock?.toString() || product.minStock,
    displayStockHint: product.displayStockHint,
    canPickupNow: Boolean(product.canPickupNow),
    category: product.category,
    tags,
    searchKeywords: product.searchKeywords,
    isAvailable: product.isAvailable !== undefined ? product.isAvailable : true,
  };
}

/**
 * Product cart view - для корзины
 * Use: GET /api/cart
 * Size: ~1.5 KB per product
 */
export function toProductCartDTO(product) {
  return {
    id: product.id,
    title: product.title,
    priceKopecks: product.priceKopecks,
    imagePath: product.imagePath,
    unitLabel: product.unitLabel,
    stepDecimal: product.stepDecimal?.toString() || product.stepDecimal,
    displayStockHint: product.displayStockHint,
  };
}

/**
 * Product search view - для поиска
 * Use: GET /api/search?q=...
 * Size: ~1 KB per product
 */
export function toProductSearchDTO(product) {
  return {
    id: product.id,
    title: product.title,
    priceKopecks: product.priceKopecks,
    imagePath: product.imagePath,
    category: product.category,
  };
}

/**
 * Product admin view - для админки
 * Use: GET /api/admin/products
 * Size: ~4 KB per product (все поля)
 */
export function toProductAdminDTO(product) {
  return {
    ...toProductDetailDTO(product),
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// ========================================
// Helper functions for arrays
// ========================================

export function toProductListDTOArray(products) {
  return products.map(toProductListDTO);
}

export function toProductDetailDTOArray(products) {
  return products.map(toProductDetailDTO);
}

export function toProductCartDTOArray(products) {
  return products.map(toProductCartDTO);
}

export function toProductSearchDTOArray(products) {
  return products.map(toProductSearchDTO);
}

export function toProductAdminDTOArray(products) {
  return products.map(toProductAdminDTO);
}
