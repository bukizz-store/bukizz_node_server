import express from "express";
import { retailerBankAccountController } from "../controllers/retailerBankAccountController.js";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * @route POST /api/v1/retailer/bank-accounts/verify
 * @desc Verify a bank account using Razorpay penny drop
 * @access Private (retailer)
 */
router.post(
    "/verify",
    authenticateToken,
    requireRoles("retailer"),
    retailerBankAccountController.verifyBankAccount
);

/**
 * @route GET /api/v1/retailer/bank-accounts
 * @desc List all bank accounts for the logged-in retailer
 * @access Private (retailer)
 */
router.get(
    "/",
    authenticateToken,
    requireRoles("retailer"),
    retailerBankAccountController.listAccounts
);

/**
 * @route POST /api/v1/retailer/bank-accounts
 * @desc Add a new bank account
 * @access Private (retailer)
 */
router.post(
    "/",
    authenticateToken,
    requireRoles("retailer"),
    retailerBankAccountController.addAccount
);

/**
 * @route PUT /api/v1/retailer/bank-accounts/:id
 * @desc Update an existing bank account
 * @access Private (retailer)
 */
router.put(
    "/:id",
    authenticateToken,
    requireRoles("retailer"),
    retailerBankAccountController.updateAccount
);

/**
 * @route DELETE /api/v1/retailer/bank-accounts/:id
 * @desc Delete a bank account
 * @access Private (retailer)
 */
router.delete(
    "/:id",
    authenticateToken,
    requireRoles("retailer"),
    retailerBankAccountController.deleteAccount
);

/**
 * @route PATCH /api/v1/retailer/bank-accounts/:id/set-primary
 * @desc Mark one account as primary (unsets all others)
 * @access Private (retailer)
 */
router.patch(
    "/:id/set-primary",
    authenticateToken,
    requireRoles("retailer"),
    retailerBankAccountController.setPrimary
);

export default router;
