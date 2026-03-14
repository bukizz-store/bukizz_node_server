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

  /**
   * Get all available shipped items for a specific warehouse
   * Handles soft-locking filter (available work for delivery partners)
   * GET /api/v1/delivery/warehouses/:warehouseId/orders
   */
  getWarehouseOrders = asyncHandler(async (req, res) => {
    const { warehouseId } = req.params;
    const partnerId = req.user?.id;
    
    if (!warehouseId) {
      return res.status(400).json({
        success: false,
        message: "Warehouse ID is required",
      });
    }

    logger.info("Fetching available items for warehouse", {
      partnerId,
      warehouseId
    });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    // Switch to getAvailableWarehouseItems which returns items + soft-lock logic
    const items = await orderRepository.getAvailableWarehouseItems(warehouseId, partnerId, {
      status: "shipped",
      limit: 100,
    });

    res.json({
      success: true,
      data: items,
      message: "Available warehouse items retrieved successfully",
    });
  });

  /**
   * Claim multiple items for a delivery partner (Soft Lock)
   * POST /api/v1/delivery/warehouses/:warehouseId/claim
   */
  claimItems = asyncHandler(async (req, res) => {
    const { warehouseId } = req.params;
    const { itemIds } = req.body;
    const partnerId = req.user?.id;

    if (!warehouseId || !itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Warehouse ID and non-empty list of Item IDs are required",
      });
    }

    if (itemIds.length > 5) {
      return res.status(400).json({
        success: false,
        message: "You can claim a maximum of 5 items at a time",
      });
    }

    logger.info("Claiming items for warehouse", {
      partnerId,
      warehouseId,
      itemCount: itemIds.length
    });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    // Enforce 5-item limit GLOBALLY (existing locks + new claims)
    const existingLockCount = await orderRepository.countValidLocks(partnerId);
    const totalRequested = existingLockCount + itemIds.length;

    if (totalRequested > 5) {
      return res.status(400).json({
        success: false,
        message: `You already have ${existingLockCount} active locks. You can claim at most ${5 - existingLockCount} more items.`,
      });
    }

    const claimedItems = await orderRepository.claimItems(itemIds, partnerId);

    if (claimedItems.length === 0) {
      return res.status(409).json({
        success: false,
        message: "No items could be claimed. They may have been claimed by someone else or your existing locks have expired.",
      });
    }

    res.json({
      success: true,
      data: claimedItems,
      message: `Successfully claimed ${claimedItems.length} items. Total active locks: ${existingLockCount + claimedItems.length}`,
    });
  });
}

export default new DeliveryController();
