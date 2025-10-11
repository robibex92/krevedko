import { AppError } from "../errors/AppError.js";

/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
  // Log error
  const logError = {
    message: err.message,
    code: err.code || "INTERNAL_ERROR",
    statusCode: err.statusCode || 500,
    stack: err.stack,
    requestId: req.id,
    path: req.path,
    method: req.method,
  };

  if (err.statusCode >= 500) {
    console.error("[ERROR]", logError);
  } else {
    console.warn("[WARN]", logError);
  }

  // Handle operational errors
  if (err.isOperational) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Prisma errors
  if (err.code && err.code.startsWith("P")) {
    return handlePrismaError(err, res);
  }

  // Handle validation errors from libraries
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: err.message,
      details: err.details || err.errors,
    });
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Invalid authentication token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "TOKEN_EXPIRED",
      message: "Authentication token expired",
    });
  }

  // Default to 500 server error
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

/**
 * Handle Prisma specific errors
 */
function handlePrismaError(err, res) {
  const { code, meta } = err;

  switch (code) {
    case "P2002": // Unique constraint violation
      return res.status(409).json({
        error: "DUPLICATE_ENTRY",
        message: "A record with this value already exists",
        details: { fields: meta?.target },
      });

    case "P2025": // Record not found
      return res.status(404).json({
        error: "RECORD_NOT_FOUND",
        message: "The requested record does not exist",
      });

    case "P2003": // Foreign key constraint
      return res.status(400).json({
        error: "INVALID_REFERENCE",
        message: "Referenced record does not exist",
        details: { field: meta?.field_name },
      });

    case "P2014": // Required relation violation
      return res.status(400).json({
        error: "REQUIRED_RELATION_MISSING",
        message: "A required relation is missing",
      });

    default:
      return res.status(500).json({
        error: "DATABASE_ERROR",
        message: "A database error occurred",
        ...(process.env.NODE_ENV === "development" && { code, meta }),
      });
  }
}

/**
 * Handle 404 routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: "ROUTE_NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
}
