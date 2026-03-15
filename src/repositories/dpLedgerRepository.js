import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * DP Ledger Repository
 * Handles all dp_ledgers table operations.
 * Pure data-access layer — append-only ledger for delivery partner earnings.
 */
export const dpLedgerRepository = {
  /**
   * Insert a single ledger entry (e.g., delivery_earning on order completion).
   * @param {Object} entry - { dp_user_id, order_id, transaction_type, amount, description }
   * @returns {Promise<Object>} Inserted row
   */
  async createEntry(entry) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("dp_ledgers")
        .insert(entry)
        .select()
        .single();

      if (error) {
        logger.error("Error inserting dp_ledger entry:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("dpLedgerRepository.createEntry failed:", error);
      throw error;
    }
  },

  /**
   * Get wallet balance (sum of all ledger amounts) for a delivery partner.
   * Credits are positive, debits (penalties/withdrawals) are negative.
   * @param {string} dpUserId
   * @returns {Promise<number>} Net balance
   */
  async getBalance(dpUserId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("dp_ledgers")
        .select("amount")
        .eq("dp_user_id", dpUserId);

      if (error) {
        logger.error("Error fetching dp_ledger balance:", error);
        throw error;
      }

      const total = (data || []).reduce(
        (sum, row) => sum + parseFloat(row.amount || 0),
        0
      );

      return parseFloat(total.toFixed(2));
    } catch (error) {
      logger.error("dpLedgerRepository.getBalance failed:", error);
      throw error;
    }
  },

  /**
   * Get recent transactions for a delivery partner (paginated, newest first).
   * @param {string} dpUserId
   * @param {Object} options - { page, limit }
   * @returns {Promise<{ transactions: Array, pagination: Object }>}
   */
  async getTransactions(dpUserId, options = {}) {
    try {
      const supabase = getSupabase();
      const page = Math.max(1, parseInt(options.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("dp_ledgers")
        .select(
          `id, order_id, transaction_type, amount, description, created_at`,
          { count: "exact" }
        )
        .eq("dp_user_id", dpUserId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error("Error fetching dp_ledger transactions:", error);
        throw error;
      }

      return {
        transactions: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("dpLedgerRepository.getTransactions failed:", error);
      throw error;
    }
  },
};
