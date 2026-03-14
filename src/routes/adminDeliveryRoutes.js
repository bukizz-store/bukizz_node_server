import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { paramSchemas, userSchemas } from "../models/schemas.js";

/**
 * Admin Delivery Routes Factory
 * @param {Object} dependencies
 * @returns {Router}
 */
export default function adminDeliveryRoutes(dependencies = {}) {
  const router = express.Router();
  const { authController } = dependencies;

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

  return router;
}
