import express from "express";
import { retailerBankAccountController } from "../controllers/retailerBankAccountController.js";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";

/**
 * Retailer Bank Account Routes Factory
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function retailerBankAccountRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessService } = dependencies;

  // All routes require authentication
  router.use(authenticateToken);

  /**
   * @route POST /api/v1/retailer/bank-accounts/verify
   * @desc Verify a bank account using Razorpay penny drop
   * @access Private (retailer)
   */
  router.post(
    "/verify",
    requirePermissions(accessService, "retailers:bank_accounts:manage"),
    retailerBankAccountController.verifyBankAccount
  );

  /**
   * @route GET /api/v1/retailer/bank-accounts
   * @desc List all bank accounts for the logged-in retailer
   * @access Private (retailer)
   */
  router.get(
    "/",
    requirePermissions(accessService, "retailers:bank_accounts:read"),
    retailerBankAccountController.listAccounts
  );

  /**
   * @route POST /api/v1/retailer/bank-accounts
   * @desc Add a new bank account
   * @access Private (retailer)
   */
  router.post(
    "/",
    requirePermissions(accessService, "retailers:bank_accounts:manage"),
    retailerBankAccountController.addAccount
  );

  /**
   * @route PUT /api/v1/retailer/bank-accounts/:id
   * @desc Update an existing bank account
   * @access Private (retailer)
   */
  router.put(
    "/:id",
    requirePermissions(accessService, "retailers:bank_accounts:manage"),
    retailerBankAccountController.updateAccount
  );

  /**
   * @route DELETE /api/v1/retailer/bank-accounts/:id
   * @desc Delete a bank account
   * @access Private (retailer)
   */
  router.delete(
    "/:id",
    requirePermissions(accessService, "retailers:bank_accounts:manage"),
    retailerBankAccountController.deleteAccount
  );

  /**
   * @route PATCH /api/v1/retailer/bank-accounts/:id/set-primary
   * @desc Mark one account as primary
   * @access Private (retailer)
   */
  router.patch(
    "/:id/set-primary",
    requirePermissions(accessService, "retailers:bank_accounts:manage"),
    retailerBankAccountController.setPrimary
  );

  return router;
}
