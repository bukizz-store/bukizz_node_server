import express from "express";
import { validate } from "../middleware/validator.js";
import { userSchemas as authSchemas } from "../models/schemas.js";

/**
 * Auth Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with auth routes
 */
export default function authRoutes(dependencies = {}) {
  const router = express.Router();

  // Get the auth controller from dependencies
  const { authController } = dependencies;

  // If no authController is provided, return empty router
  if (!authController) {
    console.error("AuthController not found in dependencies");
    return router;
  }

  // Public routes (no authentication required)
  router.post(
    "/register",
    validate(authSchemas.register),
    authController.register
  );
  router.post("/login", validate(authSchemas.login), authController.login);
  router.post(
    "/refresh-token",
    validate(authSchemas.refreshToken),
    authController.refreshToken
  );
  router.post(
    "/forgot-password",
    validate(authSchemas.forgotPassword),
    authController.requestPasswordReset
  );
  router.post(
    "/reset-password",
    validate(authSchemas.resetPassword),
    authController.resetPassword
  );
  router.post("/verify-token", authController.verifyToken);

  // Protected routes (require authentication)
  router.get("/me", authController.getProfile);
  router.post("/logout", authController.logout);

  return router;
}
