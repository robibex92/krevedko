import {
  validateRequired,
  validateMaxLength,
  validatePositiveNumber,
  validateEnum,
  validateBoolean,
} from "../core/validators/index.js";
import { ValidationError } from "../core/errors/AppError.js";

const VALID_DISPLAY_STOCK_HINTS = ["IN", "LOW", "OUT", null];

/**
 * Validate create product data
 */
export function validateCreateProduct(data) {
  validateRequired(data, ["title", "unitLabel", "stepDecimal", "priceKopecks"]);

  const title = validateMaxLength(data.title, 255, "title");
  const description = data.description
    ? validateMaxLength(data.description, 2000, "description")
    : "";
  const category = data.category
    ? validateMaxLength(data.category, 100, "category")
    : null;
  const unitLabel = validateMaxLength(data.unitLabel, 50, "unitLabel");

  const stepDecimal = String(data.stepDecimal);
  if (Number(stepDecimal) <= 0) {
    throw new ValidationError("stepDecimal must be positive");
  }

  const priceKopecks = validatePositiveNumber(data.priceKopecks, "priceKopecks");

  const isActive =
    data.isActive !== undefined ? validateBoolean(data.isActive) : true;

  const stockQuantity = data.stockQuantity ? String(data.stockQuantity) : "0";
  const minStock = data.minStock ? String(data.minStock) : "0";

  const displayStockHint = data.displayStockHint || null;
  if (displayStockHint && !VALID_DISPLAY_STOCK_HINTS.includes(displayStockHint)) {
    throw new ValidationError(
      `displayStockHint must be one of: ${VALID_DISPLAY_STOCK_HINTS.filter(Boolean).join(", ")}`,
      "INVALID_STOCK_HINT"
    );
  }

  const canPickupNow =
    data.canPickupNow !== undefined ? validateBoolean(data.canPickupNow) : false;

  const searchKeywords = data.searchKeywords
    ? validateMaxLength(data.searchKeywords, 500, "searchKeywords")
    : null;

  return {
    title,
    description,
    category,
    unitLabel,
    stepDecimal,
    priceKopecks,
    isActive,
    stockQuantity,
    minStock,
    displayStockHint,
    canPickupNow,
    searchKeywords,
    tags: data.tags || null,
  };
}

/**
 * Validate update product data
 */
export function validateUpdateProduct(data) {
  const updates = {};

  if (data.title !== undefined) {
    updates.title = validateMaxLength(data.title, 255, "title");
  }
  if (data.description !== undefined) {
    updates.description = validateMaxLength(data.description, 2000, "description");
  }
  if (data.category !== undefined) {
    updates.category = data.category
      ? validateMaxLength(data.category, 100, "category")
      : null;
  }
  if (data.unitLabel !== undefined) {
    updates.unitLabel = validateMaxLength(data.unitLabel, 50, "unitLabel");
  }
  if (data.stepDecimal !== undefined) {
    updates.stepDecimal = String(data.stepDecimal);
    if (Number(updates.stepDecimal) <= 0) {
      throw new ValidationError("stepDecimal must be positive");
    }
  }
  if (data.priceKopecks !== undefined) {
    updates.priceKopecks = validatePositiveNumber(data.priceKopecks, "priceKopecks");
  }
  if (data.isActive !== undefined) {
    updates.isActive = validateBoolean(data.isActive);
  }
  if (data.displayStockHint !== undefined) {
    updates.displayStockHint = data.displayStockHint || null;
    if (
      updates.displayStockHint &&
      !VALID_DISPLAY_STOCK_HINTS.includes(updates.displayStockHint)
    ) {
      throw new ValidationError(
        `displayStockHint must be one of: ${VALID_DISPLAY_STOCK_HINTS.filter(Boolean).join(", ")}`,
        "INVALID_STOCK_HINT"
      );
    }
  }
  if (data.canPickupNow !== undefined) {
    updates.canPickupNow = validateBoolean(data.canPickupNow);
  }
  if (data.searchKeywords !== undefined) {
    updates.searchKeywords = data.searchKeywords
      ? validateMaxLength(data.searchKeywords, 500, "searchKeywords")
      : null;
  }
  if (data.tags !== undefined) {
    updates.tags = data.tags;
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError("No updates provided");
  }

  return updates;
}

/**
 * Validate update stock data
 */
export function validateUpdateStock(data) {
  const updates = {};

  if (data.stockQuantity !== undefined) {
    updates.stockQuantity = String(data.stockQuantity);
  }

  if (data.minStock !== undefined) {
    updates.minStock = String(data.minStock);
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError("No stock updates provided");
  }

  return updates;
}

