import express from "express";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { paramSchemas, userSchemas } from "../models/schemas.js";
import defaultDeliveryController from "../controllers/deliveryController.js";

/**
 * Admin Delivery Routes Factory
 * @param {Object} dependencies
 * @returns {Router}
 */
export default function adminDeliveryRoutes(dependencies = {}) {
  const router = express.Router();
  const { authController, accessService } = dependencies;
  const deliveryController =
    dependencies.deliveryController || defaultDeliveryController;

  if (!authController) {
    console.error("AuthController not found in dependencies");
    return router;
  }

  // List pending delivery partner applications (Approvals RBAC)
  router.get(
    "/pending",
    authenticateToken,
    requirePermissions(accessService, "approvals:delivery_partners:read"),
    authController.getPendingDeliveryPartnersList,
  );

  // Approve delivery partner
  router.put(
    "/partners/:id/approve",
    authenticateToken,
    requirePermissions(accessService, "approvals:delivery_partners:manage"),
    validate(paramSchemas.id, "params"),
    validate(userSchemas.deliveryPartnerApprove),
    authController.approveDeliveryPartner,
  );

  // Assign return pickup task (Orders Returns RBAC)
  router.post(
    "/return-pickups/:returnId/assign",
    authenticateToken,
    requirePermissions(accessService, "orders:returns:manage"),
    deliveryController.assignReturnPickupByAdmin,
  );

  return router;
}
