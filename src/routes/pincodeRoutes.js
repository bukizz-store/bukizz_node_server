import express from "express";
import { PincodeController } from "../controllers/pincodeController.js";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";

/**
 * Pincode Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router
 */
export default function pincodeRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessService } = dependencies;

  // Public serviceability check
  router.get("/check/:pincode", PincodeController.checkAvailability);

  // Protected bulk insert (Admin RBAC)
  router.post(
    "/bulk",
    authenticateToken,
    requirePermissions(accessService, "pincodes:manage"),
    PincodeController.bulkInsert
  );

  return router;
}
