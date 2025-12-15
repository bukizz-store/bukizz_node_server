import express from "express";
import {
  authenticateToken,
  requireOwnership,
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

  // Get the user controller from dependencies
  const { userController } = dependencies;

  // If no userController is provided, return empty router
  if (!userController) {
    console.error("UserController not found in dependencies");
    return router;
  }

  // All user routes require authentication
  router.use(authenticateToken);

  // User profile routes (specific routes first)
  router.get("/profile", userController.getProfile);
  router.put(
    "/profile",
    validate(userSchemas.updateProfile),
    userController.updateProfile
  );

  // Address management routes
  router.get("/addresses", userController.getAddresses);
  router.post(
    "/addresses",
    validate(addressSchemas.create),
    userController.addAddress
  );
  router.put(
    "/addresses/:addressId",
    validate(addressSchemas.update),
    userController.updateAddress
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

  // Admin-only routes with specific paths (TODO: Add admin middleware)
  router.get("/admin/search", userController.searchUsers);
  router.get("/admin/export", userController.exportUsers);
  router.get(
    "/admin/:userId",
    validate(paramSchemas.userId, "params"),
    userController.getUserById
  );
  router.put(
    "/admin/:userId/role",
    validate(paramSchemas.userId, "params"),
    userController.updateUserRole
  );
  router.post(
    "/admin/:userId/reactivate",
    validate(paramSchemas.userId, "params"),
    userController.reactivateAccount
  );

  return router;
}
