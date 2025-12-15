import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import productRoutes from "./productRoutes.js";
import schoolRoutes from "./schoolRoutes.js";
import orderRoutes from "./orderRoutes.js";
import { notFoundHandler } from "../middleware/errorHandler.js";

/**
 * Setup all API routes
 * @param {Express} app - Express application instance
 * @param {Object} dependencies - Dependency injection container
 */
export function setupRoutes(app, dependencies = {}) {
  // API version prefix
  const apiV1 = "/api/v1";

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0",
    });
  });

  // API documentation endpoint
  app.get("/api", (req, res) => {
    res.json({
      message: "Bukizz School E-commerce API",
      version: "1.0.0",
      documentation: "/api/docs",
      endpoints: {
        auth: `${apiV1}/auth`,
        users: `${apiV1}/users`,
        products: `${apiV1}/products`,
        schools: `${apiV1}/schools`,
        orders: `${apiV1}/orders`,
      },
    });
  });

  // Setup route modules with dependency injection
  app.use(`${apiV1}/auth`, authRoutes(dependencies));
  app.use(`${apiV1}/users`, userRoutes(dependencies));
  app.use(`${apiV1}/products`, productRoutes(dependencies));
  app.use(`${apiV1}/schools`, schoolRoutes(dependencies));
  app.use(`${apiV1}/orders`, orderRoutes(dependencies));

  // Handle 404 for all other routes
  app.use("*", notFoundHandler);
}
