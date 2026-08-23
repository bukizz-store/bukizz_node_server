import express from "express";
import { retailerOrderController } from "../controllers/retailerOrderController.js";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { orderSchemas } from "../models/schemas.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

/**
 * Retailer Order Routes Factory
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function retailerOrderRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessService } = dependencies;

  // Rate limiting for retailer order queries
  const orderQueryLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
  });

  // All routes require authentication
  router.use(authenticateToken);

  // ─── Retailer Order Statistics ──────────────────────────────────────
  router.get(
    "/stats",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getRetailerOrderStats
  );

  // ─── Warehouse-Specific Order Endpoints ──────────────────────────────
  router.get(
    "/warehouse/:warehouseId/stats",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getWarehouseOrderStats
  );

  router.get(
    "/warehouse/:warehouseId/status/:status",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getWarehouseOrdersByStatus
  );

  router.post(
    "/warehouse/:warehouseId/filter",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getFilteredOrders
  );

  router.get(
    "/warehouse/:warehouseId/filter-options/schools",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getFilterSchools
  );

  router.get(
    "/warehouse/:warehouseId/filter-options/products",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getFilterProducts
  );

  router.get(
    "/warehouse/:warehouseId/filter-options/statuses",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getFilterStatuses
  );

  router.get(
    "/warehouse/:warehouseId",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getOrdersByWarehouse
  );

  // ─── Order Status Management ────────────────────────────────────────
  router.put(
    "/:orderId/items/:itemId/status",
    requirePermissions(accessService, "orders:warehouse:manage"),
    validate(orderSchemas.updateOrderStatus),
    retailerOrderController.updateOrderItemStatus
  );

  router.put(
    "/:orderId/status",
    requirePermissions(accessService, "orders:warehouse:manage"),
    validate(orderSchemas.updateOrderStatus),
    retailerOrderController.updateOrderStatus
  );

  // ─── Order Detail & Listing ─────────────────────────────────────────
  router.get(
    "/:orderId",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getOrderDetail
  );

  router.get(
    "/",
    requirePermissions(accessService, "orders:warehouse:read"),
    orderQueryLimiter,
    retailerOrderController.getAllRetailerOrders
  );

  return router;
}
