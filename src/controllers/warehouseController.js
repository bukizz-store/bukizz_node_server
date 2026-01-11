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

        if (req.user.role !== "retailer") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only retailers can create warehouses.",
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
}

export default new WarehouseController();
