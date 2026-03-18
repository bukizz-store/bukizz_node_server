import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/index.js";
import { logger, createRequestLogger } from "./utils/logger.js";
import { connectDB } from "./db/index.js";
import { setupRoutes } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { setupCronJobs } from "./jobs/cronJobs.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import { sanitizeMiddleware } from "./middleware/validator.js";
import cookieParser from "cookie-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main application entry point
 * Sets up Express server with all middleware, routes, and error handling
 */
export async function createApp() {
  const app = express();
  app.set("trust proxy", true);

  try {
    // Initialize database connection
    await connectDB();
    logger.info("Database connected successfully");

    // Security middleware
    app.use(createRequestLogger());
    app.use(helmet());
    app.use(cors(config.cors));
    app.use(createRateLimiter());

    // Basic middleware setup
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));
    app.use(cookieParser());

    // Global input sanitization
    app.use(sanitizeMiddleware);

    // Setup routes
    setupRoutes(app);

    // Serve sitemap statically
    app.get("/sitemap.xml", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/sitemap.xml"));
    });

    // Start cron jobs
    setupCronJobs();

    // Global error handler (must be last)
    app.use(errorHandler);

    return app;
  } catch (error) {
    logger.error("Failed to create application:", error);
    throw error;
  }
}

/**
 * Start the server
 */
export async function startServer() {
  try {
    const app = await createApp();

    const server = app.listen(config.port, () => {
      logger.info(
        `Server running on port ${config.port} in ${config.env} mode`
      );
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("SIGTERM received, shutting down gracefully");
      server.close(() => {
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      logger.info("SIGINT received, shutting down gracefully");
      server.close(() => {
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

