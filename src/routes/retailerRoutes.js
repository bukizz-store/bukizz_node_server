import express from "express";
import { retailerController } from "../controllers/retailerController.js";
import { dashboardController } from "../controllers/dashboardController.js";
import { upload } from "../middleware/upload.js";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";

/**
 * Retailer Routes Factory
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function retailerRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessService } = dependencies;

  /**
   * @route GET /api/v1/retailer/dashboard/overview
   * @desc Get aggregated dashboard overview data
   * @access Private (retailer / admin)
   */
  router.get(
    "/dashboard/overview",
    authenticateToken,
    requirePermissions(accessService, "retailers:read"),
    dashboardController.getDashboardOverview,
  );

  /**
   * @route POST /api/v1/retailer/data
   * @desc Create or update retailer profile with signature
   * @access Private
   */
  router.post(
    "/data",
    authenticateToken,
    requirePermissions(accessService, "retailers:manage"),
    upload.single("signature"),
    retailerController.createRetailerProfile,
  );

  /**
   * @route PUT /api/v1/retailer/data
   * @desc Update retailer business details
   * @access Private
   */
  router.put(
    "/data",
    authenticateToken,
    requirePermissions(accessService, "retailers:manage"),
    upload.single("signature"),
    retailerController.updateRetailerProfile,
  );

  /**
   * @route GET /api/v1/retailer/verification-status
   * @desc Check retailer verification/authorization status
   * @access Private
   */
  router.get(
    "/verification-status",
    authenticateToken,
    requirePermissions(accessService, "retailers:read"),
    retailerController.checkVerificationStatus,
  );

  /**
   * @route GET /api/v1/retailer/data/status
   * @desc Check if retailer profile data exists and is complete
   * @access Private
   */
  router.get(
    "/data/status",
    authenticateToken,
    requirePermissions(accessService, "retailers:read"),
    retailerController.checkRetailerDataStatus,
  );

  /**
   * @route GET /api/v1/retailer/data
   * @desc Get retailer profile
   * @access Private
   */
  router.get(
    "/data",
    authenticateToken,
    requirePermissions(accessService, "retailers:read"),
    retailerController.getRetailerProfile,
  );

  return router;
}
