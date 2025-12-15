import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

/**
 * Custom application error class
 * Provides structured error handling with status codes
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized error handler middleware
 * Handles all application errors and formats responses consistently
 * @param {Error} err - Error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function errorHandler(err, req, res, next) {
  let error = { ...err };
  error.message = err.message;

  // Log error with context
  logger.error("Error occurred", {
    error: error.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    correlationId: req.correlationId,
    userId: req.user?.id,
  });

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = "Resource not found";
    error = new AppError(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = "Duplicate field value entered";
    error = new AppError(message, 400);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors).map((val) => val.message);
    error = new AppError(message, 400);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    const message = "Invalid token";
    error = new AppError(message, 401);
  }

  if (err.name === "TokenExpiredError") {
    const message = "Token expired";
    error = new AppError(message, 401);
  }

  // MySQL/Database errors
  if (err.code === "ER_DUP_ENTRY") {
    const message = "Duplicate entry";
    error = new AppError(message, 400);
  }

  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    const message = "Referenced record does not exist";
    error = new AppError(message, 400);
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  const errorResponse = {
    success: false,
    error: message,
    ...(req.correlationId && { correlationId: req.correlationId }),
  };

  // Add stack trace in development
  if (config.env === "development") {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Handle 404 errors
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export function notFoundHandler(req, res) {
  const message = `Route ${req.originalUrl} not found`;
  logger.warn("Route not found", {
    url: req.originalUrl,
    method: req.method,
    correlationId: req.correlationId,
  });

  res.status(404).json({
    success: false,
    error: message,
    correlationId: req.correlationId,
  });
}

/**
 * Async error wrapper
 * Catches async errors and passes them to error handler
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
