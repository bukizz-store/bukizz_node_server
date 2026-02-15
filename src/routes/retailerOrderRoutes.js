import express from "express";
import { retailerOrderController } from "../controllers/retailerOrderController.js";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { orderSchemas } from "../models/schemas.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Rate limiting for retailer order queries
const orderQueryLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
});

// All routes require authentication + retailer role
router.use(authenticateToken);
router.use(requireRoles("retailer", "admin"));

// ========================================
// RETAILER ORDER STATISTICS
// ========================================

/**
 * @route   GET /api/v1/retailer/orders/stats
 * @desc    Get aggregated order statistics across all retailer warehouses
 * @access  Private (Retailer)
 * @query   startDate, endDate
 */
router.get(
    "/stats",
    orderQueryLimiter,
    retailerOrderController.getRetailerOrderStats
);

// ========================================
// WAREHOUSE-SPECIFIC ORDER ENDPOINTS
// ========================================

/**
 * @route   GET /api/v1/retailer/orders/warehouse/:warehouseId/stats
 * @desc    Get order statistics for a specific warehouse
 * @access  Private (Retailer)
 * @query   startDate, endDate
 */
router.get(
    "/warehouse/:warehouseId/stats",
    orderQueryLimiter,
    retailerOrderController.getWarehouseOrderStats
);

/**
 * @route   GET /api/v1/retailer/orders/warehouse/:warehouseId/status/:status
 * @desc    Get orders by status for a specific warehouse
 * @access  Private (Retailer)
 * @query   page, limit, sortBy, sortOrder
 */
router.get(
    "/warehouse/:warehouseId/status/:status",
    orderQueryLimiter,
    retailerOrderController.getWarehouseOrdersByStatus
);

/**
 * @route   GET /api/v1/retailer/orders/warehouse/:warehouseId
 * @desc    Get all orders for a specific warehouse (with filters)
 * @access  Private (Retailer)
 * @query   status, page, limit, startDate, endDate, sortBy, sortOrder, search, paymentStatus
 */
router.get(
    "/warehouse/:warehouseId",
    orderQueryLimiter,
    retailerOrderController.getOrdersByWarehouse
);

// ========================================
// ORDER STATUS MANAGEMENT
// ========================================

/**
 * @route   PUT /api/v1/retailer/orders/:orderId/items/:itemId/status
 * @desc    Update order item status (retailer can update items in their warehouses)
 * @access  Private (Retailer)
 * @body    { status, note?, metadata? }
 */
router.put(
    "/:orderId/items/:itemId/status",
    validate(orderSchemas.updateOrderStatus),
    retailerOrderController.updateOrderItemStatus
);

/**
 * @route   PUT /api/v1/retailer/orders/:orderId/status
 * @desc    Update order status (retailer can update orders in their warehouses)
 * @access  Private (Retailer)
 * @body    { status, note?, metadata? }
 */
router.put(
    "/:orderId/status",
    validate(orderSchemas.updateOrderStatus),
    retailerOrderController.updateOrderStatus
);

// ========================================
// ORDER DETAIL & LISTING
// ========================================

/**
 * @route   GET /api/v1/retailer/orders/:orderId
 * @desc    Get a specific order detail (only shows items belonging to retailer's warehouses)
 * @access  Private (Retailer)
 */
router.get(
    "/:orderId",
    orderQueryLimiter,
    retailerOrderController.getOrderDetail
);

/**
 * @route   GET /api/v1/retailer/orders
 * @desc    Get all orders across all retailer warehouses (with filters)
 * @access  Private (Retailer)
 * @query   status, page, limit, startDate, endDate, sortBy, sortOrder, search, paymentStatus
 */
router.get(
    "/",
    orderQueryLimiter,
    retailerOrderController.getAllRetailerOrders
);

export default router;
