import express from "express";
import { retailerSchoolController } from "../controllers/retailerSchoolController.js";
import {
  authenticateToken,
  requireRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @route POST /api/v1/retailer-schools/link
 * @desc Link a retailer to a school
 * @body { schoolId, retailerId?, status?, productType? }
 * @access Private
 */
router.post("/link", retailerSchoolController.linkRetailerToSchool);

/**
 * @route GET /api/v1/retailer-schools/admin/pending
 * @desc Get all pending retailer-school link requests globally
 * @access Private/Admin
 */
router.get(
  "/admin/pending",
  requireRoles("admin"),
  retailerSchoolController.getAllPendingRequests,
);

/**
 * @route GET /api/v1/retailer-schools/connected-schools
 * @desc Get all schools connected to the authenticated retailer (full school info)
 * @query ?status=approved|pending|rejected
 * @access Private
 */
router.get("/connected-schools", retailerSchoolController.getConnectedSchools);

/**
 * @route GET /api/v1/retailer-schools/connected-schools/:retailerId
 * @desc Get all schools connected to a specific retailer (full school info)
 * @query ?status=approved|pending|rejected
 * @access Private
 */
router.get(
  "/connected-schools/:retailerId",
  retailerSchoolController.getConnectedSchools,
);

/**
 * @route GET /api/v1/retailer-schools/connected-retailers/:schoolId
 * @desc Get all retailers connected to a school
 * @query ?status=approved|pending|rejected
 * @access Private
 */
router.get(
  "/connected-retailers/:schoolId",
  retailerSchoolController.getConnectedRetailers,
);

/**
 * @route PATCH /api/v1/retailer-schools/status
 * @desc Update link status (e.g. approve/reject)
 * @body { retailerId?, schoolId, currentStatus, newStatus }
 * @access Private
 */
router.patch("/status", retailerSchoolController.updateLinkStatus);

/**
 * @route PATCH /api/v1/retailer-schools/product-type
 * @desc Update product types for a retailer-school link
 * @body { retailerId?, schoolId, status, productType }
 * @access Private
 */
router.patch("/product-type", retailerSchoolController.updateProductType);

/**
 * @route DELETE /api/v1/retailer-schools
 * @desc Remove a retailer-school link
 * @body { retailerId?, schoolId, status }
 * @access Private
 */
router.delete("/", retailerSchoolController.unlinkRetailerFromSchool);

export default router;
