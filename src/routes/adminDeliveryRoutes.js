import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
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
  const { authController } = dependencies;
  const deliveryController = dependencies.deliveryController || defaultDeliveryController;

  if (!authController) {
    console.error("AuthController not found in dependencies");
    return router;
  }

  router.get(
    "/pending",
    authenticateToken,
    requireRoles("admin"),
    authController.getPendingDeliveryPartnersList,
  );

  router.put(
    "/partners/:id/approve",
    authenticateToken,
    requireRoles("admin"),
    validate(paramSchemas.id, "params"),
    validate(userSchemas.deliveryPartnerApprove),
    authController.approveDeliveryPartner,
  );

  router.post(
    "/return-pickups/:returnId/assign",
    authenticateToken,
    requireRoles("admin"),
    deliveryController.assignReturnPickupByAdmin,
  );

  return router;
}
