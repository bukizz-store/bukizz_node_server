import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";
import RetailerBankAccountRepository from "../repositories/retailerBankAccountRepository.js";
import { encrypt, decrypt, maskAccountNumber } from "../utils/encryption.js";

/**
 * Retailer Bank Account Service
 * Handles business logic for retailer bank account operations
 */
export class RetailerBankAccountService {
    constructor() {
        this.bankAccountRepo = new RetailerBankAccountRepository(getSupabase());
    }

    /**
     * List all bank accounts for a retailer (decrypts account numbers)
     * @param {string} retailerId
     * @returns {Array}
     */
    async listAccounts(retailerId) {
        const rows = await this.bankAccountRepo.findAllByRetailerId(retailerId);
        return rows.map((row) => this.formatAccount(row));
    }

    /**
     * Add a new bank account
     * @param {string} retailerId
     * @param {Object} body - camelCase input
     * @returns {Object}
     */
    async addAccount(retailerId, body) {
        this.validateAccountInput(body);

        // If this is marked primary, unset existing primary first
        if (body.isPrimary) {
            await this.bankAccountRepo.unsetAllPrimary(retailerId);
        }

        // Check if this is the first account — auto-mark as primary
        const existing = await this.bankAccountRepo.findAllByRetailerId(retailerId);
        const isPrimary = existing.length === 0 ? true : !!body.isPrimary;

        const dbData = {
            retailer_id: retailerId,
            account_holder_name: body.accountHolderName.trim(),
            account_number_encrypted: encrypt(body.accountNumber.trim()),
            account_number_masked: maskAccountNumber(body.accountNumber.trim()),
            ifsc_code: body.ifscCode.trim().toUpperCase(),
            bank_name: body.bankName.trim(),
            branch_name: body.branchName?.trim() || null,
            account_type: body.accountType || "savings",
            is_primary: isPrimary,
        };

        const row = await this.bankAccountRepo.create(dbData);
        logger.info("Bank account created", { retailerId, accountId: row.id });
        return this.formatAccount(row);
    }

    /**
     * Update an existing bank account
     * @param {string} retailerId
     * @param {string} accountId
     * @param {Object} body - partial camelCase input
     * @returns {Object}
     */
    async updateAccount(retailerId, accountId, body) {
        const existing = await this.bankAccountRepo.findById(accountId);

        if (!existing) {
            throw new AppError("Bank account not found", 404);
        }
        if (existing.retailer_id !== retailerId) {
            throw new AppError("Unauthorized access to bank account", 403);
        }

        const updateData = {};

        if (body.accountHolderName !== undefined) {
            updateData.account_holder_name = body.accountHolderName.trim();
        }
        if (body.accountNumber !== undefined) {
            updateData.account_number_encrypted = encrypt(body.accountNumber.trim());
            updateData.account_number_masked = maskAccountNumber(body.accountNumber.trim());
        }
        if (body.ifscCode !== undefined) {
            updateData.ifsc_code = body.ifscCode.trim().toUpperCase();
        }
        if (body.bankName !== undefined) {
            updateData.bank_name = body.bankName.trim();
        }
        if (body.branchName !== undefined) {
            updateData.branch_name = body.branchName.trim() || null;
        }
        if (body.accountType !== undefined) {
            if (!["savings", "current"].includes(body.accountType)) {
                throw new AppError("accountType must be 'savings' or 'current'", 400);
            }
            updateData.account_type = body.accountType;
        }
        if (body.isPrimary !== undefined) {
            if (body.isPrimary) {
                await this.bankAccountRepo.unsetAllPrimary(retailerId);
            }
            updateData.is_primary = body.isPrimary;
        }

        if (Object.keys(updateData).length === 0) {
            throw new AppError("No fields to update", 400);
        }

        const row = await this.bankAccountRepo.update(accountId, updateData);
        logger.info("Bank account updated", { retailerId, accountId });
        return this.formatAccount(row);
    }

    /**
     * Delete a bank account
     * @param {string} retailerId
     * @param {string} accountId
     */
    async deleteAccount(retailerId, accountId) {
        const existing = await this.bankAccountRepo.findById(accountId);

        if (!existing) {
            throw new AppError("Bank account not found", 404);
        }
        if (existing.retailer_id !== retailerId) {
            throw new AppError("Unauthorized access to bank account", 403);
        }

        await this.bankAccountRepo.delete(accountId);
        logger.info("Bank account deleted", { retailerId, accountId });

        // If the deleted account was primary, promote the newest remaining one
        if (existing.is_primary) {
            const remaining = await this.bankAccountRepo.findAllByRetailerId(retailerId);
            if (remaining.length > 0) {
                await this.bankAccountRepo.unsetAllPrimary(retailerId);
                await this.bankAccountRepo.setPrimary(remaining[0].id);
                logger.info("Auto-promoted new primary bank account", {
                    retailerId,
                    newPrimaryId: remaining[0].id,
                });
            }
        }

        return { deleted: true };
    }

    /**
     * Set a specific account as the primary account
     * @param {string} retailerId
     * @param {string} accountId
     * @returns {Object}
     */
    async setPrimary(retailerId, accountId) {
        const existing = await this.bankAccountRepo.findById(accountId);

        if (!existing) {
            throw new AppError("Bank account not found", 404);
        }
        if (existing.retailer_id !== retailerId) {
            throw new AppError("Unauthorized access to bank account", 403);
        }

        await this.bankAccountRepo.unsetAllPrimary(retailerId);
        const row = await this.bankAccountRepo.setPrimary(accountId);

        logger.info("Bank account set as primary", { retailerId, accountId });
        return this.formatAccount(row);
    }

    // ─── Helpers ───────────────────────────────────────────────

    /**
     * Validate required fields for creating an account
     */
    validateAccountInput(body) {
        const required = ["accountHolderName", "accountNumber", "ifscCode", "bankName"];
        const missing = required.filter((f) => !body[f]);

        if (missing.length > 0) {
            throw new AppError(`Missing required fields: ${missing.join(", ")}`, 400);
        }

        // IFSC code format: 4 letters + 0 + 6 alphanumeric
        const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
        if (!ifscRegex.test(body.ifscCode.trim().toUpperCase())) {
            throw new AppError("Invalid IFSC code format", 400);
        }

        // Account number: 9-18 digits
        const accNumRegex = /^\d{9,18}$/;
        if (!accNumRegex.test(body.accountNumber.trim())) {
            throw new AppError("Account number must be 9-18 digits", 400);
        }

        if (body.accountType && !["savings", "current"].includes(body.accountType)) {
            throw new AppError("accountType must be 'savings' or 'current'", 400);
        }
    }

    /**
     * Format DB row (snake_case) to API response (camelCase).
     * Decrypts account number for the response.
     */
    formatAccount(row) {
        if (!row) return null;
        return {
            id: row.id,
            retailerId: row.retailer_id,
            accountHolderName: row.account_holder_name,
            accountNumber: decrypt(row.account_number_encrypted),
            accountNumberMasked: row.account_number_masked,
            ifscCode: row.ifsc_code,
            bankName: row.bank_name,
            branchName: row.branch_name,
            accountType: row.account_type,
            isPrimary: row.is_primary,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

export const retailerBankAccountService = new RetailerBankAccountService();
