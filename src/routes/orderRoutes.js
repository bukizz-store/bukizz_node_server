import express from "express";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { orderSchemas, orderQuerySchemas } from "../models/schemas.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { OrderController } from "../controllers/orderController.js";

/**
 * Order Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with order routes
 */
export default function orderRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessService } = dependencies;

  // Rate limiting for order operations
  const orderCreationLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: {
      success: false,
      error: "Too many order attempts. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  });

  const orderQueryLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
  });

  // Apply authentication to all routes
  router.use(authenticateToken);

  // ─── Customer Order Endpoints (Public/Customer Exemption) ───────────

  // Create a new order (main endpoint)
  router.post(
    "/",
    orderCreationLimiter,
    validate(orderSchemas.createOrder),
    OrderController.placeOrder,
  );

  // Place a new order with comprehensive validation (alias)
  router.post(
    "/place",
    orderCreationLimiter,
    validate(orderSchemas.createOrder),
    OrderController.placeOrder,
  );

  // Calculate order summary/preview (for cart checkout)
  router.post(
    "/calculate-summary",
    orderQueryLimiter,
    validate(orderSchemas.calculateSummary),
    OrderController.calculateOrderSummary,
  );

  // Get current user's orders with filtering
  router.get("/my-orders", orderQueryLimiter, OrderController.getUserOrders);

  // ─── Admin Order Query / Support Ticket Endpoints ───────────────────
  // NOTE: These MUST be defined BEFORE the /:orderId catch-all route.

  // List all order queries (admin dashboard)
  router.get(
    "/admin/queries",
    requirePermissions(accessService, "support:queries:read"),
    validate(orderQuerySchemas.adminListQuery, "query"),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.getAdminQueries(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Get detailed view of a specific query
  router.get(
    "/admin/queries/:queryId",
    requirePermissions(accessService, "support:queries:read"),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.getAdminQueryDetail(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Add admin reply to a query thread
  router.post(
    "/admin/queries/:queryId/reply",
    requirePermissions(accessService, "support:queries:manage"),
    validate(orderQuerySchemas.adminReply),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.addAdminReply(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Update query status
  router.put(
    "/admin/queries/:queryId/status",
    requirePermissions(accessService, "support:queries:manage"),
    validate(orderQuerySchemas.adminStatusUpdate),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.updateAdminQueryStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // ─── Customer / Staff Specific Order Actions ────────────────────────

  // Get specific order details by ID
  router.get("/:orderId", orderQueryLimiter, OrderController.getOrderById);

  // Track order status and location
  router.get("/:orderId/track", orderQueryLimiter, OrderController.trackOrder);

  // Cancel order (customer self-service)
  router.put(
    "/:orderId/cancel",
    validate(orderSchemas.cancelOrder),
    OrderController.cancelOrder,
  );

  // Cancel specific order item (customer self-service)
  router.put(
    "/:orderId/items/:itemId/cancel",
    validate(orderSchemas.cancelOrder),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.cancelOrderItem(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Request return for a delivered order item (customer self-service)
  router.post(
    "/:orderId/items/:itemId/request-return",
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.requestReturn(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Create order query/support ticket (customer)
  router.post(
    "/:orderId/queries",
    validate(orderQuerySchemas.createOrderQuery),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.createOrderQuery(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Get order queries/support tickets for an order
  router.get("/:orderId/queries", async (req, res, next) => {
    try {
      const orderController = new OrderController();
      await orderController.getOrderQueries(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  // ─── Admin / Retailer Order Management Endpoints (RBAC) ─────────────

  // Get single order item detail for warehouse
  router.get(
    "/warehouse/items/:itemId",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.getWarehouseOrderItem(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Search and filter orders (admin/staff access)
  router.get(
    "/admin/search",
    requirePermissions(accessService, "orders:read"),
    orderQueryLimiter,
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.searchOrders(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Get orders by specific status (admin dashboard)
  router.get(
    "/admin/status/:status",
    requirePermissions(accessService, "orders:read"),
    orderQueryLimiter,
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.getOrdersByStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Update order status (admin/staff operation)
  router.put(
    "/:orderId/status",
    requirePermissions(accessService, "orders:manage"),
    validate(orderSchemas.updateOrderStatus),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.updateOrderStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Update order item status (admin/staff operation)
  router.put(
    "/:orderId/items/:itemId/status",
    requirePermissions(accessService, "orders:manage"),
    validate(orderSchemas.updateOrderStatus),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.updateOrderItemStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Update payment status (finance/admin operation)
  router.put(
    "/:orderId/payment",
    requirePermissions(accessService, "orders:manage"),
    validate(orderSchemas.updatePaymentStatus),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.updatePaymentStatus(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Bulk update orders (admin operation)
  router.put(
    "/admin/bulk-update",
    requirePermissions(accessService, "orders:manage"),
    validate(orderSchemas.bulkUpdateOrders),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.bulkUpdateOrders(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Export orders data (admin reporting)
  router.get(
    "/admin/export",
    requirePermissions(accessService, "orders:export:manage"),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.exportOrders(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Get order statistics and analytics
  router.get(
    "/admin/statistics",
    requirePermissions(accessService, "orders:read"),
    async (req, res, next) => {
      try {
        const orderController = new OrderController();
        await orderController.getOrderStats(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  // Legacy: Get user orders
  router.get("/", orderQueryLimiter, OrderController.getUserOrders);

  // Error Handling Middleware
  router.use((error, req, res, next) => {
    console.error("Order route error:", {
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });

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

    next(error);
  });

  return router;
}
