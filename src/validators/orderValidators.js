import {
  validateRequired,
  validatePositiveNumber,
  validateEnum,
  validateMaxLength,
} from "../core/validators/index.js";
import { ValidationError } from "../core/errors/AppError.js";

/**
 * Validate create order data
 */
export function validateCreateOrder(data) {
  // Required fields
  validateRequired(data, ["collectionId"]);

  // Validate collectionId
  const collectionId = validatePositiveNumber(data.collectionId, "collectionId");

  // Validate deliveryType (optional, defaults to PICKUP)
  let deliveryType = "PICKUP";
  if (data.deliveryType) {
    deliveryType = validateEnum(
      data.deliveryType,
      ["DELIVERY", "PICKUP"],
      "deliveryType"
    );
  }

  // Validate address if delivery
  let address = null;
  if (deliveryType === "DELIVERY") {
    if (!data.address) {
      throw new ValidationError("Address is required for delivery");
    }

    validateRequired(data.address, ["street", "house"]);

    address = {
      street: validateMaxLength(data.address.street, 255, "street"),
      house: validateMaxLength(data.address.house, 50, "house"),
      apartment: data.address.apartment
        ? validateMaxLength(data.address.apartment, 50, "apartment")
        : null,
    };
  }

  // Validate notes (optional)
  let notes = null;
  if (data.notes) {
    notes = validateMaxLength(data.notes, 500, "notes");
  }

  return {
    collectionId,
    deliveryType,
    address,
    notes,
  };
}

/**
 * Validate repeat order data
 */
export function validateRepeatOrder(data) {
  let targetCollectionId = null;

  if (data.targetCollectionId !== undefined) {
    targetCollectionId = validatePositiveNumber(
      data.targetCollectionId,
      "targetCollectionId"
    );
  }

  return { targetCollectionId };
}

