import express from "express";
import { validate } from "../middleware/validator.js";
import { userSchemas as authSchemas } from "../models/schemas.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import {
  createAuthRateLimiter,
  createOtpSendRateLimiter,
  createOtpVerifyRateLimiter,
} from "../middleware/rateLimiter.js";

/**
 * Auth Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with auth routes
 * @returns {Router} Express router with auth routes
 */
export default function authRoutes(dependencies = {}) {
  const router = express.Router();
  const authLimiter = createAuthRateLimiter();
  const otpSendLimiter = createOtpSendRateLimiter();
  const otpVerifyLimiter = createOtpVerifyRateLimiter();

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
    authLimiter,
    validate(authSchemas.register),
    authController.register
  );
  router.post("/login", authLimiter, validate(authSchemas.login), authController.login);
  router.post(
    "/login-retailer",
    authLimiter,
    validate(authSchemas.retailerLogin),
    authController.loginRetailer
  );
  router.post(
    "/register-retailer",
    authLimiter,
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
    authLimiter,
    validate(authSchemas.forgotPassword),
    authController.requestPasswordReset
  );
  router.post(
    "/reset-password",
    authLimiter,
    validate(authSchemas.resetPassword),
    authController.resetPassword
  );
  router.post("/google-login", authLimiter, authController.googleLogin);
  router.post("/apple-login", authLimiter, authController.appleLogin);
  router.post("/verify-token", authController.verifyToken);
  router.post(
    "/send-otp",
    otpSendLimiter,
    validate(authSchemas.sendOtp),
    authController.sendOtp
  );
  router.post(
    "/verify-otp",
    otpVerifyLimiter,
    validate(authSchemas.verifyOtp),
    authController.verifyOtp
  );
  router.post(
    "/send-retailer-otp",
    otpSendLimiter,
    validate(authSchemas.sendRetailerOtp),
    authController.sendRetailerOtp
  );
  router.post(
    "/verify-retailer-otp",
    otpVerifyLimiter,
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
  router.delete("/delete-account", authenticateToken, authController.deleteAccount);

  return router;
}
