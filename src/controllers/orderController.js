import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { OrderService } from "../services/orderService.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { OrderEventRepository } from "../repositories/orderEventRepository.js";
import { OrderQueryRepository } from "../repositories/orderQueryRepository.js";
import { AppError } from "../middleware/errorHandler.js";
import { getSupabase } from "../db/index.js";

// Initialize repositories and service - but defer Supabase client access
let orderService = null;

// Initialize the service when first needed (lazy initialization)
function getOrderService() {
  if (!orderService) {
    const supabase = getSupabase();
    const orderRepository = new OrderRepository(supabase);
    const productRepository = new ProductRepository();
    const userRepository = new UserRepository(supabase);
    const orderEventRepository = new OrderEventRepository();
    const orderQueryRepository = new OrderQueryRepository();

    orderService = new OrderService(
      orderRepository,
      productRepository,
      userRepository,
      orderEventRepository,
      orderQueryRepository
    );
  }
  return orderService;
}

/**
 * Order Controller
 * Handles all order-related HTTP requests with comprehensive error handling and atomic operations
 */
export class OrderController {
  constructor(orderServiceInstance) {
    this.orderService = orderServiceInstance;
  }

  /**
   * Place a new order with atomic transaction and comprehensive validation
   */
  static async placeOrder(req, res, next) {
    try {
      const startTime = Date.now();
      const userId = req.user?.id;

      if (!userId) {
        logger.warn("Order placement attempted without authentication", {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        });
        return res.status(401).json({
          success: false,
          error: "Authentication required",
          code: "UNAUTHORIZED",
        });
      }

      const {
        items,
        shippingAddress,
        billingAddress,
        contactPhone,
        contactEmail,
        paymentMethod = "cod",
        metadata = {},
      } = req.body;

      logger.info("Order placement started", {
        userId,
        itemCount: items?.length,
        paymentMethod,
        totalAmount: metadata.expectedTotal,
        requestId: req.headers["x-request-id"],
      });

      // Enhanced request validation
      const validationErrors = [];

      if (!items || !Array.isArray(items) || items.length === 0) {
        validationErrors.push("At least one item is required");
      }

      if (!shippingAddress) {
        validationErrors.push("Shipping address is required");
      }

      if (validationErrors.length > 0) {
        logger.warn("Order validation failed", {
          userId,
          errors: validationErrors,
        });
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: validationErrors,
          code: "VALIDATION_ERROR",
        });
      }

      // Prepare order data with enhanced metadata
      const orderData = {
        userId,
        items,
        shippingAddress,
        billingAddress: billingAddress || shippingAddress,
        contactPhone: contactPhone || shippingAddress.phone,
        contactEmail: contactEmail || req.user?.email,
        paymentMethod,
        metadata: {
          ...metadata,
          source: req.headers["x-source"] || "web",
          deviceInfo: {
            userAgent: req.get("User-Agent"),
            ip: req.ip,
            timestamp: new Date().toISOString(),
          },
          requestId: req.headers["x-request-id"],
          processingStartTime: startTime,
        },
      };

      // Create order with atomic transaction using lazy-initialized service
      const orderServiceInstance = getOrderService();
      const order = await orderServiceInstance.createOrder(orderData);

      const processingTime = Date.now() - startTime;

      logger.info("Order placed successfully", {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId,
        totalAmount: order.totalAmount,
        processingTime,
        itemCount: order.items?.length,
      });

      // Return comprehensive order response
      res.status(201).json({
        success: true,
        message: "Order placed successfully",
        data: {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            totalAmount: order.totalAmount,
            currency: order.currency,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            estimatedDeliveryDate:
              OrderController._calculateEstimatedDelivery(order),
            items: order.items.map((item) => ({
              id: item.id,
              productId: item.productId,
              variantId: item.variantId,
              title: item.title,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
            shippingAddress: order.shippingAddress,
            contactPhone: order.contactPhone,
            createdAt: order.createdAt,
          },
          orderSummary: order.metadata?.orderSummary || {},
          nextSteps: OrderController._getOrderNextSteps(order),
        },
        meta: {
          processingTime,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - (req.startTime || Date.now());

      logger.error("Order placement failed", {
        userId: req.user?.id,
        error: error.message,
        stack: error.stack,
        processingTime,
        requestBody: req.body,
      });

      // Handle specific error types
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code || "ORDER_ERROR",
          details: error.details,
          timestamp: new Date().toISOString(),
        });
      }

      // Handle database/connection errors
      if (
        error.code === "ER_LOCK_WAIT_TIMEOUT" ||
        error.code === "ER_LOCK_DEADLOCK"
      ) {
        return res.status(503).json({
          success: false,
          error: "Service temporarily unavailable. Please try again.",
          code: "SERVICE_UNAVAILABLE",
          retryAfter: 5,
        });
      }

      // Generic error response
      next(error);
    }
  }

  /**
   * Calculate order summary (cart preview)
   */
  static async calculateOrderSummary(req, res, next) {
    try {
      const { items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Items are required for order summary calculation",
          code: "VALIDATION_ERROR",
        });
      }

      const orderServiceInstance = getOrderService();
      const summary = await orderServiceInstance.calculateOrderSummary(items);

      res.json({
        success: true,
        data: summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Order summary calculation failed", {
        error: error.message,
        items: req.body.items,
      });

      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code || "CALCULATION_ERROR",
        });
      }

      next(error);
    }
  }

  /**
   * Get user orders with enhanced filtering
   */
  static async getUserOrders(req, res, next) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
          code: "UNAUTHORIZED",
        });
      }

      const {
        status,
        page = 1,
        limit = 20,
        startDate,
        endDate,
        sortBy = "created_at",
        sortOrder = "desc",
      } = req.query;

      const filters = {
        userId,
        status,
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100), // Cap at 100
        startDate,
        endDate,
        sortBy,
        sortOrder,
      };

      const orderService = getOrderService();
      const result = await orderService.orderRepository.getByUser(userId, filters);

      logger.info("getUserOrders result", {
        userId,
        ordersCount: result.orders?.length || 0,
        result: result,
      });

      res.json({
        success: true,
        data: result.orders,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Get user orders failed", {
        userId: req.user?.id,
        error: error.message,
        filters: req.query,
      });
      next(error);
    }
  }

  /**
   * Get order details by ID
   */
  static async getOrderById(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "Order ID is required",
          code: "VALIDATION_ERROR",
        });
      }

      const orderService = getOrderService();
      const order = await orderService.orderRepository.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
          code: "ORDER_NOT_FOUND",
        });
      }

      // Check authorization (user can only see their own orders unless admin)
      if (userRole !== "admin" && order.userId !== userId) {
        logger.warn("Unauthorized order access attempt", {
          userId,
          requestedOrderId: orderId,
          orderOwnerId: order.userId,
        });
        return res.status(403).json({
          success: false,
          error: "Access denied",
          code: "FORBIDDEN",
        });
      }

      // Add order tracking and status information
      const enrichedOrder = {
        ...order,
        timeline: order.events || [],
        canCancel: OrderController._canCancelOrder(order),
        canReturn: OrderController._canReturnOrder(order),
        trackingInfo: OrderController._getTrackingInfo(order),
      };

      res.json({
        success: true,
        data: enrichedOrder,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Get order by ID failed", {
        orderId: req.params.orderId,
        userId: req.user?.id,
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Cancel an order (with business rules)
   */
  static async cancelOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id;

      if (!orderId || !reason) {
        return res.status(400).json({
          success: false,
          error: "Order ID and cancellation reason are required",
          code: "VALIDATION_ERROR",
        });
      }

      const orderService = getOrderService();
      const order = await orderService.orderRepository.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
          code: "ORDER_NOT_FOUND",
        });
      }

      // Check if user owns the order
      if (order.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          code: "FORBIDDEN",
        });
      }

      // Check if order can be cancelled
      if (!OrderController._canCancelOrder(order)) {
        return res.status(400).json({
          success: false,
          error: "Order cannot be cancelled in current status",
          code: "CANCELLATION_NOT_ALLOWED",
          details: {
            currentStatus: order.status,
            allowedStatuses: ["initialized", "processed"],
          },
        });
      }

      const updatedOrder = await orderService.updateOrderStatus(
        orderId,
        "cancelled",
        userId,
        `Customer cancellation: ${reason}`
      );

      logger.info("Order cancelled successfully", {
        orderId,
        userId,
        reason,
        previousStatus: order.status,
      });

      res.json({
        success: true,
        message: "Order cancelled successfully",
        data: updatedOrder,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Order cancellation failed", {
        orderId: req.params.orderId,
        userId: req.user?.id,
        error: error.message,
      });

      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }

      next(error);
    }
  }

  /**
   * Track order status and location
   */
  static async trackOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user?.id;

      const orderService = getOrderService();
      const order = await orderService.orderRepository.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
          code: "ORDER_NOT_FOUND",
        });
      }

      // Check authorization
      if (order.userId !== userId && req.user?.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          code: "FORBIDDEN",
        });
      }

      const trackingData = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        estimatedDeliveryDate:
          OrderController._calculateEstimatedDelivery(order),
        trackingNumber: order.trackingNumber,
        timeline:
          order.events?.map((event) => ({
            status: event.newStatus,
            timestamp: event.createdAt,
            note: event.note,
            location: event.metadata?.location,
          })) || [],
        currentLocation: OrderController._getCurrentLocation(order),
        nextUpdate: OrderController._getNextUpdateTime(order),
      };

      res.json({
        success: true,
        data: trackingData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Order tracking failed", {
        orderId: req.params.orderId,
        userId: req.user?.id,
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Create a new order
   * POST /api/orders
   */
  createOrder = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const orderData = { ...req.body, userId };

    const order = await this.orderService.createOrder(orderData);

    logger.info("Order created", {
      orderId: order.id,
      userId,
      totalAmount: order.totalAmount,
    });

    res.status(201).json({
      success: true,
      data: { order },
      message: "Order created successfully",
    });
  });

  /**
   * Get order by ID
   * GET /api/orders/:id
   */
  getOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    const order = await this.orderService.getOrder(id, userId);

    res.json({
      success: true,
      data: { order },
      message: "Order retrieved successfully",
    });
  });

  /**
   * Get current user's orders
   * GET /api/orders
   */
  getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const result = await this.orderService.getUserOrders(userId, req.query);

    res.json({
      success: true,
      data: result,
      message: "Orders retrieved successfully",
    });
  });

  /**
   * Search orders (admin/retailer access)
   * GET /api/orders/search
   */
  searchOrders = asyncHandler(async (req, res) => {
    const result = await this.orderService.searchOrders(req.query);

    res.json({
      success: true,
      data: result,
      message: "Orders search completed successfully",
    });
  });

  /**
   * Update order status
   * PUT /api/orders/:id/status
   */
  updateOrderStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, note, metadata = {} } = req.body;
    const changedBy = req.user.id;

    const order = await this.orderService.updateOrderStatus(
      id,
      status,
      changedBy,
      note,
      metadata
    );

    logger.info("Order status updated", {
      orderId: id,
      newStatus: status,
      changedBy,
    });

    res.json({
      success: true,
      data: { order },
      message: "Order status updated successfully",
    });
  });

  /**
   * Cancel order
   * PUT /api/orders/:id/cancel
   */
  cancelOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const order = await this.orderService.cancelOrder(id, userId, reason);

    logger.info("Order cancelled", {
      orderId: id,
      userId,
      reason,
    });

    res.json({
      success: true,
      data: { order },
      message: "Order cancelled successfully",
    });
  });

  /**
   * Calculate order summary
   * POST /api/orders/calculate
   */
  calculateOrderSummary = asyncHandler(async (req, res) => {
    const { items } = req.body;
    const summary = await this.orderService.calculateOrderSummary(items);

    res.json({
      success: true,
      data: summary,
      message: "Order summary calculated successfully",
    });
  });

  /**
   * Get order statistics
   * GET /api/orders/stats
   */
  getOrderStats = asyncHandler(async (req, res) => {
    const userId = req.user?.role === "customer" ? req.user.id : null;
    const stats = await this.orderService.getOrderStats(userId, req.query);

    res.json({
      success: true,
      data: stats,
      message: "Order statistics retrieved successfully",
    });
  });

  /**
   * Create order query for customer support
   * POST /api/orders/:id/queries
   */
  createOrderQuery = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const query = await this.orderService.createOrderQuery(
      id,
      userId,
      req.body
    );

    logger.info("Order query created", {
      orderId: id,
      queryId: query.id,
      userId,
    });

    res.status(201).json({
      success: true,
      data: { query },
      message: "Order query created successfully",
    });
  });

  /**
   * Get order queries
   * GET /api/orders/:id/queries
   */
  getOrderQueries = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const queries = await this.orderService.getOrderQueries(id, userId);

    res.json({
      success: true,
      data: { queries },
      message: "Order queries retrieved successfully",
    });
  });

  /**
   * Update payment status
   * PUT /api/orders/:id/payment
   */
  updatePaymentStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { paymentStatus, paymentData = {} } = req.body;

    await this.orderService.updatePaymentStatus(id, paymentStatus, paymentData);

    logger.info("Payment status updated", {
      orderId: id,
      paymentStatus,
    });

    res.json({
      success: true,
      message: "Payment status updated successfully",
    });
  });

  /**
   * Get order tracking information
   * GET /api/orders/:id/tracking
   */
  getOrderTracking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    // Get order with events for tracking
    const order = await this.orderService.getOrder(id, userId);

    const trackingInfo = {
      orderId: order.id,
      status: order.status,
      events: order.events,
      estimatedDelivery: order.estimatedDeliveryDate,
      trackingNumber: order.trackingNumber,
      shippingAddress: order.shippingAddress,
    };

    res.json({
      success: true,
      data: trackingInfo,
      message: "Order tracking information retrieved successfully",
    });
  });

  /**
   * Bulk update orders (admin/retailer only)
   * PUT /api/orders/bulk-update
   */
  bulkUpdateOrders = asyncHandler(async (req, res) => {
    const { updates } = req.body;
    const changedBy = req.user.id;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const update of updates) {
      try {
        const { orderId, status, note } = update;
        await this.orderService.updateOrderStatus(
          orderId,
          status,
          changedBy,
          note
        );
        results.push({ orderId, success: true });
        successCount++;
      } catch (error) {
        results.push({
          orderId: update.orderId,
          success: false,
          error: error.message,
        });
        failureCount++;
      }
    }

    logger.info("Bulk order update completed", {
      total: updates.length,
      successful: successCount,
      failed: failureCount,
      changedBy,
    });

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: updates.length,
          successful: successCount,
          failed: failureCount,
        },
      },
      message: "Bulk order update completed",
    });
  });

  /**
   * Get orders by status (admin/retailer view)
   * GET /api/orders/status/:status
   */
  getOrdersByStatus = asyncHandler(async (req, res) => {
    const { status } = req.params;

    const result = await this.orderService.searchOrders({
      status,
      ...req.query,
    });

    res.json({
      success: true,
      data: result,
      message: `Orders with status '${status}' retrieved successfully`,
    });
  });

  /**
   * Export orders data (admin functionality)
   * GET /api/orders/export
   */
  exportOrders = asyncHandler(async (req, res) => {
    const filters = req.query;
    const result = await this.orderService.searchOrders({
      ...filters,
      limit: 1000, // Large limit for export
    });

    // Transform data for export
    const exportData = result.orders.map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerEmail: order.contactEmail,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      itemCount: order.items.length,
      createdAt: order.createdAt,
      shippingCity: order.shippingAddress.city,
      shippingState: order.shippingAddress.state,
    }));

    res.json({
      success: true,
      data: {
        orders: exportData,
        summary: result.pagination,
        exportedAt: new Date().toISOString(),
      },
      message: "Orders exported successfully",
    });
  });

  // Helper methods for business logic
  static _canCancelOrder(order) {
    const cancellableStatuses = ["initialized", "processed"];
    return cancellableStatuses.includes(order.status);
  }

  static _canReturnOrder(order) {
    const returnableStatuses = ["delivered"];
    const deliveredDate = order.events?.find(
      (e) => e.newStatus === "delivered"
    )?.createdAt;

    if (!returnableStatuses.includes(order.status) || !deliveredDate) {
      return false;
    }

    // Allow returns within 7 days
    const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    return Date.now() - new Date(deliveredDate).getTime() < returnWindow;
  }

  static _calculateEstimatedDelivery(order) {
    if (order.estimatedDeliveryDate) {
      return order.estimatedDeliveryDate;
    }

    // Calculate based on order date and shipping method
    const baseDeliveryDays = order.paymentMethod === "cod" ? 3 : 2;
    const deliveryDate = new Date(order.createdAt);
    deliveryDate.setDate(deliveryDate.getDate() + baseDeliveryDays);

    return deliveryDate.toISOString().split("T")[0];
  }

  static _getTrackingInfo(order) {
    return {
      trackingNumber: order.trackingNumber,
      carrier: order.metadata?.carrier || "Local Delivery",
      trackingUrl: order.trackingNumber
        ? `https://track.bukizz.com/${order.trackingNumber}`
        : null,
    };
  }

  static _getCurrentLocation(order) {
    const latestEvent = order.events?.[0];
    return latestEvent?.metadata?.location || "Processing Center";
  }

  static _getNextUpdateTime(order) {
    const statusUpdateIntervals = {
      initialized: 2, // 2 hours
      processed: 4, // 4 hours
      shipped: 8, // 8 hours
      out_for_delivery: 1, // 1 hour
    };

    const interval = statusUpdateIntervals[order.status] || 12;
    const nextUpdate = new Date();
    nextUpdate.setHours(nextUpdate.getHours() + interval);

    return nextUpdate.toISOString();
  }

  static _getOrderNextSteps(order) {
    const nextSteps = {
      initialized: [
        "Your order is being prepared",
        "You will receive a confirmation SMS/email shortly",
        "Payment verification in progress (if applicable)",
      ],
      processed: [
        "Your order is ready for shipment",
        "You will receive tracking information once shipped",
        "Estimated delivery: " +
          OrderController._calculateEstimatedDelivery(order),
      ],
      shipped: [
        "Your order is on the way",
        "Track your package using the tracking number",
        "Prepare to receive delivery",
      ],
      out_for_delivery: [
        "Your order is out for delivery",
        "Delivery expected today",
        "Please be available to receive the package",
      ],
      delivered: [
        "Order delivered successfully",
        "Please confirm receipt and quality",
        "Rate your experience",
      ],
    };

    return nextSteps[order.status] || ["Contact support for assistance"];
  }
}
