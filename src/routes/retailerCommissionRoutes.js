import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
  retailerCommissionSchemas,
  paramSchemas,
} from "../models/schemas.js";
import { createRetailerCommissionController } from "../controllers/retailerCommissionController.js";

/**
 * Retailer Commission Routes Factory
 *
 * @param {Object} [dependenciesOrController]
 * @returns {express.Router}
 */
export function createRetailerCommissionRoutes(dependenciesOrController = {}) {
  const router = express.Router();
  const ctrl =
    dependenciesOrController?.getRetailerCommissions
      ? dependenciesOrController
      : (dependenciesOrController?.retailerCommissionController ||
         createRetailerCommissionController(dependenciesOrController));

  // All commission endpoints require authentication
  router.use(authenticateToken);

  // GET /:retailerId - Inspect commissions (Admins or the Retailer themselves)
  router.get(
    "/:retailerId",
    requireRoles("admin", "retailer"),
    validate(paramSchemas.retailerId, "params"),
    ctrl.getRetailerCommissions
  );

  // POST / - Upsert commission override rules (Admin only)
  router.post(
    "/",
    requireRoles("admin"),
    validate(retailerCommissionSchemas.upsert),
    ctrl.setCommission
  );

  // DELETE /:id - Delete commission rule by ID (Admin only)
  router.delete(
    "/:id",
    requireRoles("admin"),
    validate(paramSchemas.id, "params"),
    ctrl.deleteCommission
  );

  return router;
}

export default createRetailerCommissionRoutes;
