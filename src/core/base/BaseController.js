import { asyncHandler } from "../middleware/asyncHandler.js";
import { ValidationError } from "../errors/AppError.js";

/**
 * Base controller class with common response methods
 */
export class BaseController {
  /**
   * Send success response
   */
  success(res, data, message = null, statusCode = 200) {
    const response = {
      success: true,
      ...(message && { message }),
      ...data,
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send created response
   */
  created(res, data, message = "Resource created successfully") {
    return this.success(res, data, message, 201);
  }

  /**
   * Send no content response
   */
  noContent(res) {
    return res.status(204).send();
  }

  /** Error helpers */
  badRequest(res, message = "Bad Request", data = undefined) {
    const payload = { success: false, error: "BAD_REQUEST", message };
    if (data) Object.assign(payload, data);
    return res.status(400).json(payload);
  }

  unauthorized(res, message = "Unauthorized") {
    return res.status(401).json({ success: false, error: "UNAUTHORIZED", message });
  }

  forbidden(res, message = "Forbidden") {
    return res.status(403).json({ success: false, error: "FORBIDDEN", message });
  }

  notFound(res, message = "Not Found") {
    return res.status(404).json({ success: false, error: "NOT_FOUND", message });
  }

  serverError(res, message = "Internal Server Error") {
    return res.status(500).json({ success: false, error: "INTERNAL_SERVER_ERROR", message });
  }

  /**
   * Bind all methods to instance (for auto-binding in routes)
   */
  bindMethods() {
    const prototype = Object.getPrototypeOf(this);
    const methods = Object.getOwnPropertyNames(prototype).filter((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return name !== "constructor" && typeof descriptor.value === "function";
    });

    methods.forEach((method) => {
      this[method] = this[method].bind(this);
    });
  }

  /**
   * Wrap method with asyncHandler
   */
  wrap(method) {
    return asyncHandler(method.bind(this));
  }

  /**
   * Get pagination params from request
   */
  getPaginationParams(req) {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    return { page, limit };
  }

  /**
   * Get sort params from request
   */
  getSortParams(req, defaultSort = { id: "desc" }) {
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

    if (!sortBy) return defaultSort;

    return { [sortBy]: sortOrder };
  }

  /**
   * Extract user from request
   */
  getUser(req) {
    return req.user;
  }

  /**
   * Get user ID from request
   */
  getUserId(req) {
    return req.user?.id;
  }

  /**
   * Check if user is admin
   */
  isAdmin(req) {
    return req.user?.role === "ADMIN";
  }

  /**
   * Get ID parameter from request
   */
  getIdParam(req, paramName = "id") {
    const id = parseInt(req.params[paramName], 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError(
        `Invalid ${paramName} parameter`,
        "INVALID_ID_PARAMETER"
      );
    }
    return id;
  }
}
