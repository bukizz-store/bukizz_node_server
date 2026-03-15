import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Delivery Bank Service (Factory Function with DI)
 *
 * Handles bank account verification via Razorpay penny-drop
 * and persists masked references to the database.
 *
 * @param {Object} deps
 * @param {Object} deps.deliveryRepository
 * @param {Function} deps.verifyBankAccountFn - razorpayVerificationService.verifyBankAccount
 * @returns {Object} Service methods
 */
const deliveryBankService = ({ deliveryRepository, verifyBankAccountFn }) => {
  /**
   * Mask an account number, keeping only the last 4 digits visible.
   * e.g. "123456789012" → "********9012"
   */
  function maskAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber.length < 4) return "****";
    const visible = accountNumber.slice(-4);
    const masked = "*".repeat(accountNumber.length - 4);
    return `${masked}${visible}`;
  }

  return {
    /**
     * Verify a delivery partner's bank account via Razorpay and save references.
     *
     * @param {string} userId - Delivery partner user ID
     * @param {Object} rawBankData - Validated input { accountName, accountNumber, ifsc }
     * @returns {Promise<Object>} Saved bank details (masked)
     */
    async verifyAndSaveBankDetails(userId, rawBankData) {
      const { accountName, accountNumber, ifsc } = rawBankData;

      // TODO: Enable Razorpay penny-drop verification once RazorpayX is available
      // let verificationResult;
      // try {
      //   verificationResult = await verifyBankAccountFn({
      //     name: accountName,
      //     account_number: accountNumber,
      //     ifsc,
      //   });
      // } catch (err) {
      //   logger.error("Bank verification failed for DP", {
      //     userId, ifsc, error: err.message,
      //   });
      //   throw new AppError(err.message || "Bank account verification failed", 400);
      // }
      //
      // const fundAccountId = verificationResult?.fund_account?.id
      //   || verificationResult?.fund_account_id
      //   || verificationResult?.id;
      //
      // if (!fundAccountId) {
      //   throw new AppError(
      //     "Bank verification succeeded but no fund account ID was returned", 400
      //   );
      // }

      // Mask account number — never store full plaintext
      const maskedNumber = maskAccountNumber(accountNumber);

      // Persist to database (verification skipped — status set to "pending")
      const bankData = {
        bank_account_name: accountName.trim(),
        bank_account_number_masked: maskedNumber,
        bank_ifsc: ifsc.trim().toUpperCase(),
        razorpay_fund_account_id: null,
        bank_verification_status: "pending",
      };

      const updated = await deliveryRepository.updateBankDetails(
        userId,
        bankData
      );

      logger.info("DP bank details saved (verification skipped)", {
        userId,
        maskedNumber,
      });

      return {
        accountName: updated.bank_account_name,
        accountNumberMasked: updated.bank_account_number_masked,
        ifsc: updated.bank_ifsc,
        verificationStatus: updated.bank_verification_status,
      };
    },

    /**
     * Get saved bank details for a delivery partner.
     * @param {string} userId
     * @returns {Promise<Object|null>}
     */
    async getBankDetails(userId) {
      const row = await deliveryRepository.getBankDetails(userId);
      if (!row || !row.bank_account_name) return null;

      return {
        accountName: row.bank_account_name,
        accountNumberMasked: row.bank_account_number_masked,
        ifsc: row.bank_ifsc,
        verificationStatus: row.bank_verification_status,
      };
    },
  };
};

export default deliveryBankService;
