import Razorpay from "razorpay";
import { config } from "../config/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Verifies a bank account using Razorpay's Penny Drop (FAV) API
 * @param {Object} params - { name, account_number, ifsc }
 * @returns {Promise<Object>} - Verification result
 */
export async function verifyBankAccount({ name, account_number, ifsc }) {
  try {
    // 1. Create a contact (idempotent by name+type)
    const contact = await razorpay.contacts.create({
      name,
      type: "employee", // or "customer" as per your use case
    });

    // 2. Create a fund account for the contact
    const fundAccount = await razorpay.fundAccounts.create({
      contact_id: contact.id,
      account_type: "bank_account",
      bank_account: {
        name,
        ifsc,
        account_number,
      },
    });

    // 3. Initiate fund account validation (penny drop)
    let fav;
    if (razorpay.fundAccountValidations && typeof razorpay.fundAccountValidations.create === "function") {
      fav = await razorpay.fundAccountValidations.create({
        account_number,
        fund_account: fundAccount.id,
        amount: 1, // 1 INR penny drop
        currency: "INR",
      });
    } else {
      // Use raw API call if SDK property is missing
      fav = await razorpay.api.post({
        url: "/fund_account_validations",
        data: {
          account_number,
          fund_account: fundAccount.id,
          amount: 1,
          currency: "INR",
        },
      });
    }
    return fav;
  } catch (error) {
    logger.error("Razorpay bank account verification failed", error);
    throw new AppError(
      error?.error?.description || error.message || "Bank account verification failed",
      400
    );
  }
}
