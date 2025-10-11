/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
      ...(process.env.NODE_ENV === "development" && { stack: this.stack }),
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message = "Validation failed", details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource = "Resource", id = null) {
    const message = id
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(
      message,
      404,
      `${resource.toUpperCase().replace(/\s+/g, "_")}_NOT_FOUND`
    );
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized access") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends AppError {
  constructor(message = "Access forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message = "Resource conflict", code = "CONFLICT") {
    super(message, 409, code);
  }
}

/**
 * Business logic error (422)
 */
export class BusinessLogicError extends AppError {
  constructor(message, code = "BUSINESS_LOGIC_ERROR", details = null) {
    super(message, 422, code, details);
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message = "Database operation failed", originalError = null) {
    super(message, 500, "DATABASE_ERROR");
    this.originalError = originalError;
  }
}
