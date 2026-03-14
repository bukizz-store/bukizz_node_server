import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import deliveryController from "../controllers/deliveryController.js";

/**
 * Delivery Routes Factory
 * @param {Object} dependencies
 * @returns {Router}
 */
export default function deliveryRoutes(dependencies = {}) {
  const router = express.Router();

  // Route to get list of warehouses with shipped orders
  // Using standard authenticateToken, we could add requireRoles("delivery_partner") if needed
  router.get(
    "/warehouses-with-shipped-orders",
    authenticateToken,
    deliveryController.getShippedWarehouses
  );

  // Route to get list of shipped items for a specific warehouse
  router.get(
    "/warehouses/:warehouseId/orders",
    authenticateToken,
    deliveryController.getWarehouseOrders
  );

  // Route to claim items (soft lock)
  router.post(
    "/warehouses/:warehouseId/claim",
    authenticateToken,
    deliveryController.claimItems
  );

  return router;
}
