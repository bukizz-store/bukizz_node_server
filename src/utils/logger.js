import winston from "winston";
import { config } from "../config/index.js";

const { combine, timestamp, errors, json, simple, colorize } = winston.format;

/**
 * Create Winston logger instance with appropriate transports
 * Provides structured logging for production and readable logs for development
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(errors({ stack: true }), timestamp(), json()),
  defaultMeta: {
    service: "bukizz-server",
    environment: config.env,
  },
  transports: [
    // Write all logs to files
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport for development
if (config.env !== "production") {
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), simple()),
    })
  );
}

/**
 * Create request logger middleware
 * Logs HTTP requests with correlation ID for tracing
 */
export function createRequestLogger() {
  return (req, res, next) => {
    const start = Date.now();
    const correlationId =
      req.headers["x-correlation-id"] ||
      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    req.correlationId = correlationId;

    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info("HTTP Request", {
        correlationId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
      });
    });

    next();
  };
}

/**
 * Log with correlation ID if available
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 * @param {Request} req - Express request object (optional)
 */
export function logWithContext(level, message, meta = {}, req = null) {
  const logMeta = {
    ...meta,
    ...(req?.correlationId && { correlationId: req.correlationId }),
  };

  logger[level](message, logMeta);
}

export { logger };
