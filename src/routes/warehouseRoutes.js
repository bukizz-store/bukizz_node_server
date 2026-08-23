import express from "express";
import warehouseController from "../controllers/warehouseController.js";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";

/**
 * Warehouse Routes Factory
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function warehouseRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessService } = dependencies;

  /**
   * @route   POST /api/v1/warehouses
   * @desc    Add a new warehouse
   * @access  Private (Retailer, Admin)
   */
  router.post(
    "/",
    authenticateToken,
    requirePermissions(accessService, "retailers:warehouses:manage"),
    warehouseController.addWarehouse
  );

  /**
   * @route   POST /api/v1/warehouses/admin
   * @desc    Add a new warehouse (Admin)
   * @access  Private (Admin)
   */
  router.post(
    "/admin",
    authenticateToken,
    requirePermissions(accessService, "warehouses:manage"),
    warehouseController.addWarehouseByAdmin
  );

  /**
   * @route   GET /api/v1/warehouses
   * @desc    Get warehouses for the logged-in user
   * @access  Private (Retailer, Admin)
   */
  router.get(
    "/",
    authenticateToken,
    requirePermissions(accessService, "retailers:warehouses:read"),
    warehouseController.getMyWarehouses
  );

  /**
   * @route   PUT /api/v1/warehouses/admin/:id
   * @desc    Update a warehouse (Admin)
   * @access  Private (Admin)
   */
  router.put(
    "/admin/:id",
    authenticateToken,
    requirePermissions(accessService, "warehouses:manage"),
    warehouseController.updateWarehouseByAdmin
  );

  /**
   * @route   DELETE /api/v1/warehouses/admin/:id
   * @desc    Delete a warehouse (Admin)
   * @access  Private (Admin)
   */
  router.delete(
    "/admin/:id",
    authenticateToken,
    requirePermissions(accessService, "warehouses:manage"),
    warehouseController.deleteWarehouseByAdmin
  );

  /**
   * @route   GET /api/v1/warehouses/retailer/:retailerId
   * @desc    Get warehouses for a specific retailer
   * @access  Private (Admin)
   */
  router.get(
    "/retailer/:retailerId",
    authenticateToken,
    requirePermissions(accessService, "retailers:warehouses:read"),
    warehouseController.getWarehousesByRetailer
  );

  /**
   * @route   PUT /api/v1/warehouses/:id
   * @desc    Update a warehouse
   * @access  Private (Retailer, Admin)
   */
  router.put(
    "/:id",
    authenticateToken,
    requirePermissions(accessService, "retailers:warehouses:manage"),
    warehouseController.updateWarehouse
  );

  /**
   * @route   GET /api/v1/warehouses/:id
   * @desc    Get warehouse by ID
   * @access  Private (Retailer, Admin)
   */
  router.get(
    "/:id",
    authenticateToken,
    requirePermissions(accessService, "warehouses:read"),
    warehouseController.getWarehouseById
  );

  /**
   * @route   DELETE /api/v1/warehouses/:id
   * @desc    Delete a warehouse
   * @access  Private (Retailer, Admin)
   */
  router.delete(
    "/:id",
    authenticateToken,
    requirePermissions(accessService, "retailers:warehouses:manage"),
    warehouseController.deleteWarehouse
  );

  return router;
}
