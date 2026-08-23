import express from "express";
import { retailerSchoolController } from "../controllers/retailerSchoolController.js";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";

/**
 * Retailer School Linking Routes Factory
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function retailerSchoolRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessService } = dependencies;

  // All routes require authentication
  router.use(authenticateToken);

  /**
   * @route POST /api/v1/retailer-schools/link
   * @desc Link a retailer to a school
   * @access Private (Retailer)
   */
  router.post(
    "/link",
    requirePermissions(accessService, "retailers:schools:manage"),
    retailerSchoolController.linkRetailerToSchool
  );

  /**
   * @route GET /api/v1/retailer-schools/admin/pending
   * @desc Get all pending retailer-school link requests globally
   * @access Private/Admin (Approvals RBAC)
   */
  router.get(
    "/admin/pending",
    requirePermissions(accessService, "approvals:school_retailers:read"),
    retailerSchoolController.getAllPendingRequests,
  );

  /**
   * @route GET /api/v1/retailer-schools/connected-schools
   * @desc Get all schools connected to the authenticated retailer
   * @access Private
   */
  router.get(
    "/connected-schools",
    requirePermissions(accessService, "retailers:schools:read"),
    retailerSchoolController.getConnectedSchools
  );

  /**
   * @route GET /api/v1/retailer-schools/connected-schools/:retailerId
   * @desc Get all schools connected to a specific retailer
   * @access Private
   */
  router.get(
    "/connected-schools/:retailerId",
    requirePermissions(accessService, "retailers:schools:read"),
    retailerSchoolController.getConnectedSchools,
  );

  /**
   * @route GET /api/v1/retailer-schools/connected-retailers/:schoolId
   * @desc Get all retailers connected to a school
   * @access Private
   */
  router.get(
    "/connected-retailers/:schoolId",
    requirePermissions(accessService, "retailers:schools:read"),
    retailerSchoolController.getConnectedRetailers,
  );

  /**
   * @route PATCH /api/v1/retailer-schools/status
   * @desc Update link status (approve/reject link request)
   * @access Private (Admin Approvals)
   */
  router.patch(
    "/status",
    requirePermissions(accessService, "approvals:school_retailers:manage"),
    retailerSchoolController.updateLinkStatus
  );

  /**
   * @route PATCH /api/v1/retailer-schools/product-type
   * @desc Update product types for a retailer-school link
   * @access Private
   */
  router.patch(
    "/product-type",
    requirePermissions(accessService, "retailers:schools:manage"),
    retailerSchoolController.updateProductType
  );

  /**
   * @route DELETE /api/v1/retailer-schools
   * @desc Remove a retailer-school link
   * @access Private
   */
  router.delete(
    "/",
    requirePermissions(accessService, "retailers:schools:manage"),
    retailerSchoolController.unlinkRetailerFromSchool
  );

  return router;
}
