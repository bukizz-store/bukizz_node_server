import express from "express";
import { retailerController } from "../controllers/retailerController.js";
import { dashboardController } from "../controllers/dashboardController.js";
import { upload } from "../middleware/upload.js";
import {
  authenticateToken,
  requireRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * @route GET /api/v1/retailer/dashboard/overview
 * @desc Get aggregated dashboard overview data (stats, schools, recent orders)
 * @access Private (retailer)
 */
router.get(
  "/dashboard/overview",
  authenticateToken,
  requireRoles("retailer", "admin"),
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
  requireRoles("retailer"),
  upload.single("signature"),
  retailerController.createRetailerProfile,
);

/**
 * @route GET /api/v1/retailer/verification-status
 * @desc Check retailer verification/authorization status
 * @access Private (retailer)
 */
router.get(
  "/verification-status",
  authenticateToken,
  retailerController.checkVerificationStatus,
);

/**
 * @route GET /api/v1/retailer/data/status
 * @desc Check if retailer profile data exists and is complete
 * @access Private (retailer)
 */
router.get(
  "/data/status",
  authenticateToken,
  retailerController.checkRetailerDataStatus,
);

/**
 * @route GET /api/v1/retailer/data
 * @desc Get retailer profile
 * @access Private
 */
router.get("/data", authenticateToken, retailerController.getRetailerProfile);

export default router;
