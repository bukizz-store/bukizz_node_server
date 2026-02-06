import express from "express";
import warehouseController from "../controllers/warehouseController.js";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/warehouses
 * @desc    Add a new warehouse
 * @access  Private (Retailer, Admin)
 */
router.post(
    "/",
    authenticateToken,
    // requireRoles("retailer", "admin"), // Uncomment when roles are implemented
    warehouseController.addWarehouse
);

/**
 * @route   POST /api/warehouses/admin
 * @desc    Add a new warehouse (Admin)
 * @access  Private (Admin)
 */
router.post(
    "/admin",
    authenticateToken,
    // requireRoles("admin"), // Uncomment when roles are implemented
    warehouseController.addWarehouseByAdmin
);

/**
 * @route   GET /api/warehouses
 * @desc    Get warehouses for the logged-in user
 * @access  Private (Retailer, Admin)
 */
router.get(
    "/",
    authenticateToken,
    // requireRoles("retailer", "admin"), // Uncomment when roles are implemented
    warehouseController.getMyWarehouses
);

/**
 * @route   PUT /api/warehouses/admin/:id
 * @desc    Update a warehouse (Admin)
 * @access  Private (Admin)
 */
router.put(
    "/admin/:id",
    authenticateToken,
    // requireRoles("admin"), // Uncomment when roles are implemented
    warehouseController.updateWarehouseByAdmin
);

/**
 * @route   DELETE /api/warehouses/admin/:id
 * @desc    Delete a warehouse (Admin)
 * @access  Private (Admin)
 */
router.delete(
    "/admin/:id",
    authenticateToken,
    // requireRoles("admin"), // Uncomment when roles are implemented
    warehouseController.deleteWarehouseByAdmin
);

/**
 * @route   GET /api/warehouses/retailer/:retailerId
 * @desc    Get warehouses for a specific retailer
 * @access  Private (Admin)
 */
router.get(
    "/retailer/:retailerId",
    authenticateToken,
    warehouseController.getWarehousesByRetailer
);

/**
 * @route   PUT /api/warehouses/:id
 * @desc    Update a warehouse
 * @access  Private (Retailer, Admin)
 */
router.put(
    "/:id",
    authenticateToken,
    warehouseController.updateWarehouse
);

/**
 * @route   GET /api/warehouses/:id
 * @desc    Get warehouse by ID
 * @access  Private (Retailer, Admin)
 */
router.get(
    "/:id",
    authenticateToken,
    warehouseController.getWarehouseById
);

/**
 * @route   DELETE /api/warehouses/:id
 * @desc    Delete a warehouse
 * @access  Private (Retailer, Admin)
 */
router.delete(
    "/:id",
    authenticateToken,
    warehouseController.deleteWarehouse
);

export default router;
