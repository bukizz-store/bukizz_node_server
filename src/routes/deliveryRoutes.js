import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import defaultDeliveryController from "../controllers/deliveryController.js";

/**
 * Delivery Routes Factory
 * @param {Object} dependencies
 * @returns {Router}
 */
export default function deliveryRoutes(dependencies = {}) {
  const router = express.Router();
  const deliveryController = dependencies.deliveryController || defaultDeliveryController;

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

  // Route to confirm pickup after QR scan (shipped → out_for_delivery)
  router.post(
    "/confirm-pickup",
    authenticateToken,
    deliveryController.confirmPickup
  );

  // Route to get active deliveries for the current partner
  router.get(
    "/active-deliveries",
    authenticateToken,
    deliveryController.getActiveDeliveries
  );

  // Route to mark an item as delivered (out_for_delivery → delivered)
  router.post(
    "/items/:itemId/mark-delivered",
    authenticateToken,
    deliveryController.markDelivered
  );

  // Route to create a Razorpay payment link for COD orders
  router.post(
    "/create-payment-link",
    authenticateToken,
    deliveryController.createPaymentLink
  );

  // Route to poll payment status for an order
  router.get(
    "/payment-status/:orderId",
    authenticateToken,
    deliveryController.getPaymentStatus
  );

  // Route to get wallet balance and recent transactions
  router.get(
    "/wallet/balance",
    authenticateToken,
    deliveryController.getWalletBalance
  );

  // Route to get delivery history (past delivered items)
  router.get(
    "/history",
    authenticateToken,
    deliveryController.getDeliveryHistory
  );

  // Route to add & verify bank details (penny-drop)
  router.post(
    "/bank-details",
    authenticateToken,
    deliveryController.addBankDetails
  );

  // Route to get saved bank details
  router.get(
    "/bank-details",
    authenticateToken,
    deliveryController.getBankDetails
  );

  return router;
}
