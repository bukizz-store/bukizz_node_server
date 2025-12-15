const express = require("express");
const config = require("./config");
const logger = require("./utils/logger");
const { connectDB } = require("./db");
const { setupRoutes } = require("./routes");
const { errorHandler } = require("./middleware/errorHandler");

/**
 * Main application entry point
 * Sets up Express server with all middleware, routes, and error handling
 */
async function createApp() {
  const app = express();

  try {
    // Initialize database connection
    await connectDB();
    logger.info("Database connected successfully");

    // Basic middleware setup
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // CORS middleware
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Content-Length, X-Requested-With"
      );

      if (req.method === "OPTIONS") {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Setup routes
    setupRoutes(app);

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
async function startServer() {
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
if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
