import express from "express";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
  userSchemas,
  addressSchemas,
  paramSchemas,
} from "../models/schemas.js";

/**
 * User Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with user routes
 */
export default function userRoutes(dependencies = {}) {
  const router = express.Router();
  const { userController, accessService } = dependencies;

  if (!userController) {
    console.error("UserController not found in dependencies");
    return router;
  }

  // Public verification route
  router.post("/verify-email/confirm", userController.confirmEmail);

  // All user routes require authentication
  router.use(authenticateToken);

  // ─── Customer Self-Service Profile & Addresses (Exempt from Admin RBAC) ─
  router.get("/profile", userController.getProfile);
  router.put(
    "/profile",
    validate(userSchemas.updateProfile),
    userController.updateProfile,
  );

  // Address management routes
  router.get("/addresses", userController.getAddresses);
  router.post(
    "/addresses",
    validate(addressSchemas.create),
    userController.addAddress,
  );
  router.put(
    "/addresses/:addressId",
    validate(addressSchemas.update),
    userController.updateAddress,
  );
  router.delete("/addresses/:addressId", userController.deleteAddress);

  // Preferences and settings
  router.get("/preferences", userController.getPreferences);
  router.put("/preferences", userController.updatePreferences);

  // User statistics and activity
  router.get("/stats", userController.getUserStats);

  // Account management
  router.delete("/account", userController.deactivateAccount);
  router.post("/verify-email", userController.verifyEmail);
  router.post("/verify-phone", userController.verifyPhone);

  // ─── Admin User Management Routes (RBAC Guarded) ─────────────────────
  router.get(
    "/admin/search",
    requirePermissions(accessService, "users:read"),
    userController.searchUsers
  );
  router.get(
    "/admin/export",
    requirePermissions(accessService, "users:export:manage"),
    userController.exportUsers
  );
  router.get(
    "/admin/:userId",
    requirePermissions(accessService, "users:read"),
    validate(paramSchemas.userId, "params"),
    userController.getUserById,
  );
  router.put(
    "/admin/:userId",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.userId, "params"),
    userController.updateUserByAdmin,
  );
  router.put(
    "/admin/:userId/role",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.userId, "params"),
    userController.updateUserRole,
  );
  router.post(
    "/admin/:userId/reactivate",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.userId, "params"),
    userController.reactivateAccount,
  );

  // ─── Retailer Onboarding Approvals (Admin RBAC) ─────────────────────
  router.get(
    "/admin/retailers/pending",
    requirePermissions(accessService, "approvals:retailers:read"),
    validate(userSchemas.pendingRetailersQuery, "query"),
    userController.getPendingRetailersList,
  );

  router.patch(
    "/admin/retailers/:userId/approve",
    requirePermissions(accessService, "approvals:retailers:manage"),
    validate(paramSchemas.userId, "params"),
    userController.approveRetailerAccount,
  );

  return router;
}
