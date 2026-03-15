import Razorpay from "razorpay";
import { config } from "../config/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Verifies a bank account using Razorpay's Penny Drop (FAV) API.
 *
 * The standard SDK exposes `customers` & `fundAccount` but NOT
 * `contacts` or `fundAccountValidations`. We use `razorpay.api.post`
 * for the RazorpayX endpoints that aren't wrapped by the SDK.
 *
 * @param {Object} params - { name, account_number, ifsc }
 * @returns {Promise<Object>} - Fund account + validation result
 */
export async function verifyBankAccount({ name, account_number, ifsc }) {
  try {
    // 1. Create a RazorpayX Contact (not in SDK — use raw API)
    const contact = await razorpay.api.post({
      url: "/contacts",
      data: {
        name,
        type: "employee",
      },
    });

    // 2. Create a Fund Account linked to the contact
    const fundAccount = await razorpay.api.post({
      url: "/fund_accounts",
      data: {
        contact_id: contact.id,
        account_type: "bank_account",
        bank_account: {
          name,
          ifsc,
          account_number,
        },
      },
    });

    // 3. Initiate Fund Account Validation (penny drop)
    const fav = await razorpay.api.post({
      url: "/fund_accounts/validations",
      data: {
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
        fund_account: {
          id: fundAccount.id,
        },
        amount: 100, // in paise = ₹1
        currency: "INR",
        notes: {
          purpose: "delivery_partner_bank_verification",
        },
      },
    });

    // Attach fund_account info for the caller
    return { ...fav, fund_account: fundAccount };
  } catch (error) {
    logger.error("Razorpay bank account verification failed", error);
    throw new AppError(
      error?.error?.description || error.message || "Bank account verification failed",
      400
    );
  }
}
