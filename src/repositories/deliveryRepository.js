import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Delivery Repository
 * Handles delivery_partner_data table operations for bank details.
 */
export const deliveryRepository = {
  /**
   * Update bank details for a delivery partner.
   * @param {string} userId - Delivery partner user ID
   * @param {Object} bankData - { bank_account_name, bank_account_number_masked, bank_ifsc, razorpay_fund_account_id, bank_verification_status }
   * @returns {Promise<Object>} Updated row
   */
  async updateBankDetails(userId, bankData) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("delivery_partner_data")
        .update({
          ...bankData,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating DP bank details:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("deliveryRepository.updateBankDetails failed:", error);
      throw error;
    }
  },

  /**
   * Get bank details for a delivery partner.
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  async getBankDetails(userId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("delivery_partner_data")
        .select(
          "bank_account_name, bank_account_number_masked, bank_ifsc, razorpay_fund_account_id, bank_verification_status"
        )
        .eq("user_id", userId)
        .single();

      if (error) {
        logger.error("Error fetching DP bank details:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("deliveryRepository.getBankDetails failed:", error);
      throw error;
    }
  },
};
