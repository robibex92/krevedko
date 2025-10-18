import { ValidationError } from "../errors/AppError.js";

/**
 * Validation helper functions
 */

/**
 * Validate required fields
 */
export function validateRequired(data, fields) {
  const missing = [];

  for (const field of fields) {
    if (
      data[field] === undefined ||
      data[field] === null ||
      data[field] === ""
    ) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new ValidationError("Required fields missing", {
      fields: missing,
    });
  }
}

/**
 * Validate email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError("Invalid email format");
  }
  return email.toLowerCase().trim();
}

/**
 * Validate positive number
 */
export function validatePositiveNumber(value, fieldName = "value") {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number`);
  }
  return num;
}

/**
 * Validate integer
 */
export function validateInteger(value, fieldName = "value") {
  const num = Number(value);
  if (isNaN(num) || !Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} must be an integer`);
  }
  return num;
}

/**
 * Validate enum value
 */
export function validateEnum(value, allowedValues, fieldName = "value") {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`,
      { allowedValues }
    );
  }
  return value;
}

/**
 * Sanitize string
 */
export function sanitizeString(value) {
  if (typeof value !== "string") return value;
  return value.trim();
}

/**
 * Validate string length
 */
export function validateStringLength(value, min, max, fieldName = "value") {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (min !== null && value.length < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min} characters`
    );
  }

  if (max !== null && value.length > max) {
    throw new ValidationError(`${fieldName} must be at most ${max} characters`);
  }

  return value;
}

/**
 * Validate min length
 */
export function validateMinLength(value, minLength, fieldName = "value") {
  if (typeof value !== "string" || value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLength} characters`
    );
  }
  return value;
}

/**
 * Validate max length
 */
export function validateMaxLength(value, maxLength, fieldName = "value") {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must be at most ${maxLength} characters`
    );
  }
  return value;
}

/**
 * Validate boolean
 */
export function validateBoolean(value, fieldName = "value") {
  if (typeof value !== "boolean") {
    throw new ValidationError(`${fieldName} must be a boolean`);
  }
  return value;
}

/**
 * Validate date
 */
export function validateDate(value, fieldName = "value") {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }
  return date;
}

/**
 * Validate array
 */
export function validateArray(value, fieldName = "value") {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  return value;
}

/**
 * Validate object
 */
export function validateObject(value, fieldName = "value") {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object`);
  }
  return value;
}

/**
 * Validate URL
 */
export function validateUrl(value, fieldName = "value") {
  try {
    new URL(value);
    return value;
  } catch {
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

/**
 * Validate phone number (basic)
 */
export function validatePhone(value, fieldName = "value") {
  if (!value) {
    throw new ValidationError(`${fieldName} is required`);
  }

  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  if (!phoneRegex.test(value)) {
    throw new ValidationError(
      `${fieldName} must be a valid phone number. Correct format: +7 XXX XXX XXXX`
    );
  }

  // Убираем все кроме цифр для проверки длины
  const cleanPhone = value.replace(/\D/g, "");

  if (cleanPhone.length !== 11) {
    throw new ValidationError(
      `${fieldName} must contain exactly 11 digits. Correct format: +7 XXX XXX XXXX`
    );
  }

  if (!cleanPhone.startsWith("7")) {
    throw new ValidationError(
      `${fieldName} must start with +7. Correct format: +7 XXX XXX XXXX`
    );
  }

  return value.trim();
}

/**
 * Create validation middleware
 * @param {Function} schema - Validation schema function
 * @returns {Function} Express middleware
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      const result = schema(req.body);
      req.validatedData = result;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate request body against schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - Validation schema { field: validator }
 * @returns {Object} Validated and sanitized data
 */
export function validateSchema(data, schema) {
  const validated = {};
  const errors = {};

  for (const [field, validator] of Object.entries(schema)) {
    try {
      validated[field] = validator(data[field]);
    } catch (error) {
      errors[field] = error.message;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", { fields: errors });
  }

  return validated;
}
