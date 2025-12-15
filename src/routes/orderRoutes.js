import express from "express";
import {
  authenticateToken,
  requireRoles,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { orderSchemas } from "../models/schemas.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { OrderController } from "../controllers/orderController.js";

/**
 * Order Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with order routes
 */
export default function orderRoutes(dependencies = {}) {
  const router = express.Router();

  // Rate limiting for order operations
  const orderCreationLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Increased from 5 to 20 orders per 15 minutes per user
    message: {
      success: false,
      error: "Too many order attempts. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  });

  const orderQueryLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // Increased from 30 to 60 requests per minute
  });

  // Apply authentication to all routes
  router.use(authenticateToken);

  /**
   * CUSTOMER ORDER ENDPOINTS
   */

  // Create a new order (main endpoint)
  router.post(
    "/",
    orderCreationLimiter,
    validate(orderSchemas.createOrder),
    OrderController.placeOrder
  );

  // Place a new order with comprehensive validation and atomic transaction (alias)
  router.post(
    "/place",
    orderCreationLimiter,
    validate(orderSchemas.createOrder),
    OrderController.placeOrder
  );

  // Calculate order summary/preview (for cart checkout)
  router.post(
    "/calculate-summary",
    orderQueryLimiter,
    validate(orderSchemas.calculateSummary),
    OrderController.calculateOrderSummary
  );

  // Get current user's orders with filtering
  router.get("/my-orders", orderQueryLimiter, OrderController.getUserOrders);

  // Get specific order details by ID
  router.get("/:orderId", orderQueryLimiter, OrderController.getOrderById);

  // Track order status and location
  router.get("/:orderId/track", orderQueryLimiter, OrderController.trackOrder);

  // Cancel order (customer self-service)
  router.put(
    "/:orderId/cancel",
    validate(orderSchemas.cancelOrder),
    OrderController.cancelOrder
  );

  // Create order query/support ticket
  router.post(
    "/:orderId/queries",
    validate(orderSchemas.createOrderQuery),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.createOrderQuery(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get order queries/support tickets
  router.get("/:orderId/queries", async (req, res, next) => {
    try {
      const orderController = new OrderController();
      await orderController.getOrderQueries(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  /**
   * ADMIN/RETAILER ORDER MANAGEMENT ENDPOINTS
   */

  // Search and filter orders (admin/retailer access)
  router.get(
    "/admin/search",
    requireRoles(["admin", "retailer"]),
    orderQueryLimiter,
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.searchOrders(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get orders by specific status (admin dashboard)
  router.get(
    "/admin/status/:status",
    requireRoles(["admin", "retailer"]),
    orderQueryLimiter,
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.getOrdersByStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update order status (admin/retailer operation)
  router.put(
    "/:orderId/status",
    requireRoles(["admin", "retailer"]),
    validate(orderSchemas.updateOrderStatus),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.updateOrderStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update payment status (payment gateway webhook or admin)
  router.put(
    "/:orderId/payment",
    requireRoles(["admin", "system"]),
    validate(orderSchemas.updatePaymentStatus),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.updatePaymentStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Bulk update orders (admin operation)
  router.put(
    "/admin/bulk-update",
    requireRoles(["admin"]),
    validate(orderSchemas.bulkUpdateOrders),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.bulkUpdateOrders(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Export orders data (admin reporting)
  router.get(
    "/admin/export",
    requireRoles(["admin"]),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.exportOrders(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get order statistics and analytics
  router.get(
    "/admin/statistics",
    requireRoles(["admin", "retailer"]),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.getOrderStats(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * LEGACY ENDPOINTS (for backward compatibility)
   */

  // Legacy: Get user orders
  router.get("/", orderQueryLimiter, OrderController.getUserOrders);

  /**
   * ERROR HANDLING MIDDLEWARE
   */
  router.use((error, req, res, next) => {
    // Log the error with context
    console.error("Order route error:", {
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });

    // Handle specific order-related errors
    if (error.code === "INSUFFICIENT_STOCK") {
      return res.status(409).json({
        success: false,
        error: "Some items are out of stock",
        code: "INSUFFICIENT_STOCK",
        details: error.details,
      });
    }

    if (error.code === "INVALID_ADDRESS") {
      return res.status(400).json({
        success: false,
        error: "Invalid shipping address",
        code: "INVALID_ADDRESS",
        details: error.details,
      });
    }

    if (error.code === "PAYMENT_FAILED") {
      return res.status(402).json({
        success: false,
        error: "Payment processing failed",
        code: "PAYMENT_FAILED",
        details: error.details,
      });
    }

    // Pass to general error handler
    next(error);
  });

  return router;
}
