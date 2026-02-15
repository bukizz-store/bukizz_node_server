import { retailerBankAccountService } from "../services/retailerBankAccountService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

import { verifyBankAccount } from "../services/razorpayVerificationService.js";

/**
 * Retailer Bank Account Controller
 * Handles HTTP request/response for retailer bank account operations
 */
export class RetailerBankAccountController {

    /**
     * POST /api/v1/retailer/bank-accounts/verify
     * Verifies a bank account using Razorpay penny drop
     */
    verifyBankAccount = asyncHandler(async (req, res) => {
        const { accountHolderName, accountNumber, ifscCode } = req.body;
        if (!accountHolderName || !accountNumber || !ifscCode) {
            return res.status(400).json({
                success: false,
                message: "accountHolderName, accountNumber, and ifscCode are required",
            });
        }
        const result = await verifyBankAccount({
            name: accountHolderName,
            account_number: accountNumber,
            ifsc: ifscCode,
        });
        res.status(200).json({
            success: true,
            data: result,
            message: "Bank account verification result",
        });
    });
    /**
     * GET /api/v1/retailer/bank-accounts
     * List all bank accounts for the authenticated retailer
     */
    listAccounts = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;

        const accounts = await retailerBankAccountService.listAccounts(retailerId);

        res.status(200).json({
            success: true,
            data: accounts,
            message: "Bank accounts retrieved successfully",
        });
    });

    /**
     * POST /api/v1/retailer/bank-accounts
     * Add a new bank account
     */
    addAccount = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;

        const account = await retailerBankAccountService.addAccount(retailerId, req.body);

        logger.info("Bank account added", { retailerId, accountId: account.id });

        res.status(201).json({
            success: true,
            data: account,
            message: "Bank account added successfully",
        });
    });

    /**
     * PUT /api/v1/retailer/bank-accounts/:id
     * Update an existing bank account
     */
    updateAccount = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;
        const accountId = req.params.id;

        const account = await retailerBankAccountService.updateAccount(retailerId, accountId, req.body);

        res.status(200).json({
            success: true,
            data: account,
            message: "Bank account updated successfully",
        });
    });

    /**
     * DELETE /api/v1/retailer/bank-accounts/:id
     * Delete a bank account
     */
    deleteAccount = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;
        const accountId = req.params.id;

        await retailerBankAccountService.deleteAccount(retailerId, accountId);

        res.status(200).json({
            success: true,
            data: null,
            message: "Bank account deleted successfully",
        });
    });

    /**
     * PATCH /api/v1/retailer/bank-accounts/:id/set-primary
     * Mark a bank account as the primary account
     */
    setPrimary = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;
        const accountId = req.params.id;

        const account = await retailerBankAccountService.setPrimary(retailerId, accountId);

        res.status(200).json({
            success: true,
            data: account,
            message: "Bank account set as primary successfully",
        });
    });
}

export const retailerBankAccountController = new RetailerBankAccountController();
