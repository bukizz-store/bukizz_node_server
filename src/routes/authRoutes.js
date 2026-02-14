import express from "express";
import { validate } from "../middleware/validator.js";
import { userSchemas as authSchemas } from "../models/schemas.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

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
    "/login-retailer",
    validate(authSchemas.retailerLogin),
    authController.loginRetailer
  );
  router.post(
    "/register-retailer",
    validate(authSchemas.retailerRegister),
    authController.registerRetailer
  );
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
  router.post("/google-login", authController.googleLogin);
  router.post("/verify-token", authController.verifyToken);
  router.post("/send-otp", authController.sendOtp);
  router.post("/verify-otp", authController.verifyOtp);
  router.post(
    "/send-retailer-otp",
    validate(authSchemas.sendRetailerOtp),
    authController.sendRetailerOtp
  );
  router.post(
    "/verify-retailer-otp",
    validate(authSchemas.verifyRetailerOtp),
    authController.verifyRetailerOtp
  );

  // Protected routes (require authentication)
  router.put(
    "/verify-retailer",
    authenticateToken,
    authController.verifyRetailer
  );
  router.get("/me", authenticateToken, authController.getProfile);
  router.post("/logout", authenticateToken, authController.logout);

  return router;
}
