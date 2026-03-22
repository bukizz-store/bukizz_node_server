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

  // Route to send OTP for warehouse arrival verification
  router.post(
    "/warehouses/:warehouseId/arrival-otp",
    authenticateToken,
    deliveryController.sendWarehouseArrivalOTP
  );

  // Route to verify OTP for warehouse arrival
  router.post(
    "/warehouses/:warehouseId/verify-arrival-otp",
    authenticateToken,
    deliveryController.verifyWarehouseArrivalOTP
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

  // Route to send delivery OTP when DP is away from destination
  router.post(
    "/items/:itemId/delivery-otp",
    authenticateToken,
    deliveryController.sendDeliveryOtp
  );

  // Route to verify delivery OTP and complete delivery
  router.post(
    "/items/:itemId/verify-delivery-otp",
    authenticateToken,
    deliveryController.verifyDeliveryOtp
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

  // ═══════════════════════════════════════════════════════════════════════
  // RTO (Return to Origin) Routes - When delivery partner cannot deliver
  // ═══════════════════════════════════════════════════════════════════════

  // Route to initiate RTO for an item (delivery failed)
  router.post(
    "/items/:itemId/initiate-rto",
    authenticateToken,
    deliveryController.initiateRTO
  );

  // Route to get all RTO items that DP needs to return
  router.get(
    "/rto-items",
    authenticateToken,
    deliveryController.getRTOItems
  );

  // Route to confirm RTO dropoff at warehouse
  router.post(
    "/rto/:returnId/confirm-dropoff",
    authenticateToken,
    deliveryController.confirmRTODropoff
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Customer Return Pickup Routes - When customer requests return after delivery
  // ═══════════════════════════════════════════════════════════════════════

  // Route to get available return pickups
  router.get(
    "/return-pickups",
    authenticateToken,
    deliveryController.getReturnPickups
  );

  // Route to claim a return pickup
  router.post(
    "/return-pickups/:returnId/claim",
    authenticateToken,
    deliveryController.claimReturnPickup
  );

  // Route to confirm return pickup from customer
  router.post(
    "/return-pickups/:returnId/confirm-pickup",
    authenticateToken,
    deliveryController.confirmReturnPickup
  );

  // Route to confirm return dropoff at warehouse
  router.post(
    "/return-pickups/:returnId/confirm-dropoff",
    authenticateToken,
    deliveryController.confirmReturnDropoff
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Cash Collection Routes
  // ═══════════════════════════════════════════════════════════════════════

  // Route to get current cash in hand balance
  router.get(
    "/cash/balance",
    authenticateToken,
    deliveryController.getCashBalance
  );

  // Route to submit cash remittance for admin approval
  router.post(
    "/cash/submit",
    authenticateToken,
    deliveryController.submitCashRemittance
  );

  return router;
}
