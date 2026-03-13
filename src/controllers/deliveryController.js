import { asyncHandler } from "../middleware/errorHandler.js";
import warehouseRepository from "../repositories/warehouseRepository.js";
import { logger } from "../utils/logger.js";

export class DeliveryController {
  /**
   * Get all warehouses that have shipped orders, with order counts
   * GET /api/v1/delivery/warehouses-with-shipped-orders
   */
  getShippedWarehouses = asyncHandler(async (req, res) => {
    logger.info("Fetching warehouses with shipped orders", {
      userId: req.user?.id,
    });

    const token = req.headers.authorization?.split(' ')[1];
    
    // Fetch the list of warehouses using the warehouse repository
    const warehouses = await warehouseRepository.getWarehousesWithShippedOrders(token);

    res.json({
      success: true,
      data: warehouses,
      message: "Warehouses with shipped orders retrieved successfully",
    });
  });
}

export default new DeliveryController();
