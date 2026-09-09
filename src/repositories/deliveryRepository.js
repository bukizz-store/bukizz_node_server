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
  /**
   * Get all delivered COD orders for a DP that have not been remitted.
   * @param {string} partnerId
   * @returns {Promise<Array>}
   */
  async getCashInHandOrders(partnerId) {
    try {
      const supabase = getSupabase();

      // 1. Get all remitted order IDs for this DP
      const { data: remittances, error: remError } = await supabase
        .from("dp_cash_remittances")
        .select("order_ids")
        .eq("dp_id", partnerId)
        .neq("status", "rejected");

      if (remError) throw remError;

      const remittedOrderIds = new Set();
      remittances.forEach((r) => {
        r.order_ids.forEach((id) => remittedOrderIds.add(id));
      });

      // 2. Get all delivered COD orders
      const { data: orders, error: orderError } = await supabase
        .from("orders")
        .select("id, order_number, order_total_amount, delivered_at")
        .eq("delivery_partner_id", partnerId)
        .eq("status", "delivered")
        .eq("payment_method", "COD");

      if (orderError) throw orderError;

      // 3. Filter out remitted ones
      return orders.filter((o) => !remittedOrderIds.has(o.id));
    } catch (error) {
      logger.error("deliveryRepository.getCashInHandOrders failed:", error);
      throw error;
    }
  },

  /**
   * Submit a new cash remittance.
   * @param {string} partnerId
   * @param {Array<string>} orderIds
   * @param {number} amount
   * @returns {Promise<Object>}
   */
  async submitCashRemittance(partnerId, orderIds, amount) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("dp_cash_remittances")
        .insert({
          dp_id: partnerId,
          order_ids: orderIds,
          amount: amount,
          status: "pending",
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error("Error submitting cash remittance:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("deliveryRepository.submitCashRemittance failed:", error);
      throw error;
    }
  },

  async getAllCashRemittances(status = null) {
    try {
      const supabase = getSupabase();
      let query = supabase
        .from("dp_cash_remittances")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: remittances, error } = await query;
      if (error) throw error;
      
      if (!remittances || remittances.length === 0) return [];

      // Extract unique dp_ids (which correspond to user IDs)
      const dpIds = [...new Set(remittances.map(r => r.dp_id).filter(Boolean))];

      if (dpIds.length === 0) return remittances;

      // Fetch the corresponding users
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, full_name, phone")
        .in("id", dpIds);

      if (usersError) {
        logger.error("getAllCashRemittances: Failed to fetch users", usersError);
        // Return without joined user data if it fails, but ideally it shouldn't
        return remittances;
      }

      const userMap = new Map();
      (users || []).forEach(u => userMap.set(u.id, u));

      // Merge data
      return remittances.map(r => ({
        ...r,
        delivery_partner: userMap.has(r.dp_id) 
          ? userMap.get(r.dp_id) 
          : { id: r.dp_id, full_name: "Unknown", phone: "N/A" }
      }));
    } catch (error) {
      logger.error("deliveryRepository.getAllCashRemittances failed:", error);
      throw error;
    }
  },

  /**
   * Approve a cash remittance
   * @param {string} remittanceId
   * @param {string} adminId
   * @returns {Promise<Object>}
   */
  async approveCashRemittance(remittanceId, adminId) {
    try {
      const supabase = getSupabase();

      // 1. Get the remittance to get the order IDs
      const { data: remittance, error: fetchError } = await supabase
        .from("dp_cash_remittances")
        .select("order_ids")
        .eq("id", remittanceId)
        .single();

      if (fetchError || !remittance) throw new Error("Remittance not found");

      // 2. Update remittance status
      const { error: updateError } = await supabase
        .from("dp_cash_remittances")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: adminId,
        })
        .eq("id", remittanceId);

      if (updateError) throw updateError;

      return { success: true };
    } catch (error) {
      logger.error("deliveryRepository.approveCashRemittance failed:", error);
      throw error;
    }
  },
};
