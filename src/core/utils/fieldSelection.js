/**
 * Field Selection Utilities
 * Allows clients to specify which fields they want in API responses
 */

/**
 * Select only specified fields from object
 * @param {Object} data - Source object
 * @param {Array<string>} fields - Fields to select
 * @returns {Object} - Object with only selected fields
 */
export function selectFields(data, fields) {
  if (!data) return data;
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return data; // Return all fields
  }

  const selected = {};
  for (const field of fields) {
    if (field in data) {
      selected[field] = data[field];
    }
  }
  return selected;
}

/**
 * Select fields from array of objects
 * @param {Array} array - Array of objects
 * @param {Array<string>} fields - Fields to select
 * @returns {Array} - Array with only selected fields in each object
 */
export function selectFieldsFromArray(array, fields) {
  if (!Array.isArray(array)) return array;
  return array.map((item) => selectFields(item, fields));
}

/**
 * Parse fields from query string
 * @param {string} fieldsQuery - Comma-separated fields: "id,title,price"
 * @returns {Array<string>|null}
 *
 * @example
 * parseFieldsQuery("id,title,priceKopecks")
 * // Returns: ["id", "title", "priceKopecks"]
 */
export function parseFieldsQuery(fieldsQuery) {
  if (!fieldsQuery || typeof fieldsQuery !== "string") {
    return null;
  }

  return fieldsQuery
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Build Prisma select object from field list
 * @param {Array<string>|null} fields - Fields to select
 * @param {Array<string>} allowedFields - Allowed fields for this resource
 * @returns {Object|null} - Prisma select object or null for all fields
 *
 * @example
 * buildPrismaSelect(["id", "title"], ["id", "title", "description"])
 * // Returns: { id: true, title: true }
 */
export function buildPrismaSelect(fields, allowedFields) {
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return null; // Select all fields
  }

  const select = {};
  const allowed = allowedFields || [];

  // Always include id
  select.id = true;

  for (const field of fields) {
    if (field === "id") continue; // Already added
    if (allowed.length === 0 || allowed.includes(field)) {
      select[field] = true;
    }
  }

  return select;
}

/**
 * Apply field selection to response data
 * Handles both objects and arrays
 * @param {Object|Array} data - Response data
 * @param {Array<string>|null} fields - Fields to select
 * @returns {Object|Array} - Filtered data
 */
export function applyFieldSelection(data, fields) {
  if (!fields) return data;

  if (Array.isArray(data)) {
    return selectFieldsFromArray(data, fields);
  }

  // Handle objects with nested arrays
  if (typeof data === "object" && data !== null) {
    const result = {};

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        result[key] = selectFieldsFromArray(value, fields);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  return selectFields(data, fields);
}
