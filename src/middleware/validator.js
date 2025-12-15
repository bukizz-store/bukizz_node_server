import Joi from "joi";
import { AppError } from "./errorHandler.js";

/**
 * Validation middleware factory
 * Creates middleware to validate request data using Joi schemas
 * @param {Object} schema - Joi validation schema
 * @param {string} property - Request property to validate (body, query, params)
 * @returns {Function} Validation middleware
 */
export function validate(schema, property = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message)
        .join(", ");

      return next(new AppError(`Validation error: ${errorMessage}`, 400));
    }

    // Replace request property with sanitized value
    req[property] = value;
    next();
  };
}

/**
 * Sanitize input to prevent XSS attacks
 * @param {any} input - Input to sanitize
 * @returns {any} Sanitized input
 */
function sanitizeInput(input) {
  if (typeof input === "string") {
    return input
      .replace(/[<>]/g, "") // Remove angle brackets
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }

  if (typeof input === "object" && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * Input sanitization middleware
 * Sanitizes all request data to prevent XSS
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function sanitizeMiddleware(req, res, next) {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }

  if (req.query) {
    req.query = sanitizeInput(req.query);
  }

  if (req.params) {
    req.params = sanitizeInput(req.params);
  }

  next();
}
