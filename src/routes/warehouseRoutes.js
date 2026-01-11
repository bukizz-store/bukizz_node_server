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
