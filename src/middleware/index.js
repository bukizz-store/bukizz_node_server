import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { config } from "../config/index.js";
import { createRequestLogger } from "../utils/logger.js";
import { createRateLimiter } from "./rateLimiter.js";

/**
 * Setup all Express middleware in the correct order
 * @param {Express} app - Express application instance
 */
export function setupMiddleware(app) {
  // Security middleware - should be first
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    })
  );

  // CORS configuration
  app.use(cors(config.cors));

  // Compression middleware
  app.use(compression());

  // Request parsing middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Request logging
  app.use(createRequestLogger());

  // Rate limiting
  app.use(createRateLimiter());

  // Trust proxy for deployment behind reverse proxy
  app.set("trust proxy", 1);
}
