import {
  validateRequired,
  validatePositiveNumber,
} from "../core/validators/index.js";

/**
 * Validate add cart item data
 */
export function validateAddCartItem(data) {
  validateRequired(data, ["productId", "quantity", "collectionId"]);

  const productId = validatePositiveNumber(data.productId, "productId");
  const collectionId = validatePositiveNumber(data.collectionId, "collectionId");

  // Quantity will be validated against step in service
  const quantity = String(data.quantity);

  return {
    productId,
    quantity,
    collectionId,
  };
}

/**
 * Validate update cart item data
 */
export function validateUpdateCartItem(data) {
  validateRequired(data, ["quantity"]);

  const quantity = String(data.quantity);

  return { quantity };
}

