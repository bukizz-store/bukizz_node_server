import warehouseService from "../services/warehouseService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

export class WarehouseController {
    constructor() {
        this.warehouseService = warehouseService;
    }

    /**
     * Add a new warehouse
     * POST /api/warehouses
     */
    addWarehouse = asyncHandler(async (req, res) => {
        // Extract retailerId from authenticated user
        // Assuming the auth middleware adds user to req.user and the role check is done before
        const retailerId = req.user?.id;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated or ID missing",
            });
        }

        if (req.user.role !== "retailer" && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only retailers and admins can create warehouses.",
            });
        }

        const warehouse = await this.warehouseService.addWarehouse(
            req.body,
            retailerId,
            req.token
        );

        res.status(201).json({
            success: true,
            data: { warehouse },
            message: "Warehouse created successfully",
        });
    });

    /**
     * Add a new warehouse (Admin)
     * POST /api/warehouses/admin
     */
    addWarehouseByAdmin = asyncHandler(async (req, res) => {
        // 1. Check if user is admin (Double check, though route middleware should handle it)
        // role check might be handled by middleware, but good to have explicit check or assume middleware does it.
        // The prompt asked for explicit edge cases.
        // Assuming req.user is populated.

        // Note: In some systems admin role might be different, but based on context 'admin' is the role.
        // If the route doesn't have requireRoles('admin'), we must check here.
        if (req.user?.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only admins can perform this action.",
            });
        }

        const { retailerId, ...warehouseData } = req.body;

        if (!retailerId) {
            return res.status(400).json({
                success: false,
                message: "retailerId is required for admin warehouse creation",
            });
        }

        // 2. Call service
        // We pass the retailerId from body, and the admin's token (or just token).
        // The service uses the token for DB client creation.
        const warehouse = await this.warehouseService.addWarehouse(
            warehouseData,
            retailerId,
            req.token
        );

        res.status(201).json({
            success: true,
            data: { warehouse },
            message: "Warehouse created successfully by admin",
        });
    });

    /**
     * Get my warehouses
     * GET /api/warehouses
     */
    getMyWarehouses = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated or ID missing",
            });
        }

        const warehouses = await this.warehouseService.getMyWarehouses(retailerId, req.token);

        res.json({
            success: true,
            data: { warehouses },
            message: "Warehouses retrieved successfully",
        });
    });

    /**
     * Get warehouse by ID
     * GET /api/warehouses/:id
     */
    getWarehouseById = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const warehouse = await this.warehouseService.getWarehouseById(id);

        res.json({
            success: true,
            data: { warehouse },
            message: "Warehouse retrieved successfully",
        });
    });

    /**
     * Get warehouses for a specific retailer (Admin)
     * @route GET /api/v1/warehouses/retailer/:retailerId
     */
    getWarehousesByRetailer = asyncHandler(async (req, res) => {
        const { retailerId } = req.params;

        // TODO: Add stricter role check if needed (e.g. req.user.role === 'admin')

        const warehouses = await this.warehouseService.getWarehousesByRetailer(retailerId, req.token);

        res.status(200).json({
            success: true,
            data: { warehouses },
        });
    });
    /**
     * Update warehouse
     * PUT /api/warehouses/:id
     */
    updateWarehouse = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const retailerId = req.user?.id;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        if (req.user.role !== "retailer") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only retailers can update warehouses.",
            });
        }

        const warehouse = await this.warehouseService.updateWarehouse(
            id,
            req.body,
            retailerId
        );

        res.json({
            success: true,
            data: { warehouse },
            message: "Warehouse updated successfully",
        });
    });

    /**
     * Delete warehouse
     * DELETE /api/warehouses/:id
     */
    deleteWarehouse = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const retailerId = req.user?.id;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        if (req.user.role !== "retailer") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only retailers can delete warehouses.",
            });
        }

        await this.warehouseService.deleteWarehouse(id, retailerId);

        res.json({
            success: true,
            data: { deleted: true },
            message: "Warehouse deleted successfully",
        });
    });

    /**
     * Update warehouse (Admin)
     * PUT /api/warehouses/admin/:id
     */
    updateWarehouseByAdmin = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (req.user?.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only admins can update warehouses.",
            });
        }

        const warehouse = await this.warehouseService.updateWarehouseByAdmin(
            id,
            req.body
        );

        res.json({
            success: true,
            data: { warehouse },
            message: "Warehouse updated successfully by admin",
        });
    });

    /**
     * Delete warehouse (Admin)
     * DELETE /api/warehouses/admin/:id
     */
    deleteWarehouseByAdmin = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (req.user?.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only admins can delete warehouses.",
            });
        }

        await this.warehouseService.deleteWarehouseByAdmin(id);

        res.json({
            success: true,
            data: { deleted: true },
            message: "Warehouse deleted successfully by admin",
        });
    });
}

export default new WarehouseController();
