import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

/**
 * Create rate limiter with configurable options
 * Protects against brute force attacks and API abuse
 * @param {Object} options - Rate limiting options
 * @returns {Function} Rate limiting middleware
 */
export function createRateLimiter(options = {}) {
  const defaultOptions = {
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    message: {
      error: "Too many requests from this IP, please try again later.",
      retryAfter:
        Math.ceil(config.security.rateLimitWindowMs / 1000 / 60) + " minutes",
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn("Rate limit exceeded", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        correlationId: req.correlationId,
      });

      res.status(429).json({
        error: "Too many requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: Math.ceil(config.security.rateLimitWindowMs / 1000),
      });
    },
  };

  return rateLimit({ ...defaultOptions, ...options });
}

/**
 * Strict rate limiter for authentication endpoints
 * @returns {Function} Strict rate limiting middleware
 */
export function createAuthRateLimiter() {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Increased from 5 to 50 attempts per window for development
    skipSuccessfulRequests: true,
    message: {
      error: "Too many authentication attempts, please try again later.",
      retryAfter: "15 minutes",
    },
  });
}
