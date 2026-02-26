import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Settlement Repository
 * Handles all settlements & settlement_ledger_items table operations.
 * Pure data-access layer — no business logic (FIFO calc lives in the Service).
 */
export const settlementRepository = {
  /**
   * Execute the full FIFO settlement as an atomic transaction via RPC.
   *
   * The database function `execute_fifo_settlement` is expected to:
   *   1. Insert the settlement record.
   *   2. Update each affected seller_ledger row (status, settled_amount).
   *   3. Insert mapping rows into settlement_ledger_items.
   *
   * @param {Object}        settlementRecord - Row for the `settlements` table.
   * @param {Array<Object>} ledgerUpdates    - Array of { id, status, settled_amount } patches.
   * @param {Array<Object>} mappingRecords   - Rows for the `settlement_ledger_items` table.
   * @returns {Promise<Object>} Result returned by the RPC function.
   */
  async executeFifoSettlement(settlementRecord, ledgerUpdates, mappingRecords) {
    try {
      const supabase = getSupabase();

      // ── Primary path: single atomic RPC call ──────────────────────────
      const payload = {
        settlement: settlementRecord,
        ledger_updates: ledgerUpdates,
        mapping_records: mappingRecords,
      };

      const { data, error } = await supabase.rpc("execute_fifo_settlement", {
        payload,
      });

      if (error) {
        logger.error("RPC execute_fifo_settlement failed:", error);
        throw error;
      }

      return data;

      // ── Fallback: sequential calls (use if RPC is not deployed yet) ───
      // Uncomment the block below and comment out the RPC block above.
      //
      // const supabase = getSupabase();
      //
      // // 1. Insert settlement record
      // const { data: settlement, error: settlementError } = await supabase
      //   .from("settlements")
      //   .insert(settlementRecord)
      //   .select()
      //   .single();
      //
      // if (settlementError) {
      //   logger.error("Error inserting settlement record:", settlementError);
      //   throw settlementError;
      // }
      //
      // // 2. Update each affected ledger row
      // for (const update of ledgerUpdates) {
      //   const { id, ...patch } = update;
      //   const { error: ledgerError } = await supabase
      //     .from("seller_ledgers")
      //     .update(patch)
      //     .eq("id", id);
      //
      //   if (ledgerError) {
      //     logger.error(`Error updating ledger entry ${id}:`, ledgerError);
      //     throw ledgerError;
      //   }
      // }
      //
      // // 3. Insert mapping records (link settlement ↔ ledger entries)
      // const mappingsWithSettlementId = mappingRecords.map((m) => ({
      //   ...m,
      //   settlement_id: settlement.id,
      // }));
      //
      // const { error: mappingError } = await supabase
      //   .from("settlement_ledger_items")
      //   .insert(mappingsWithSettlementId);
      //
      // if (mappingError) {
      //   logger.error("Error inserting settlement mapping records:", mappingError);
      //   throw mappingError;
      // }
      //
      // return settlement;
    } catch (error) {
      logger.error("settlementRepository.executeFifoSettlement failed:", error);
      throw error;
    }
  },

  /**
   * Fetch filtered settlement (payout) history.
   *
   * @param {Object} filters
   * @param {string} [filters.retailerId]
   * @param {string} [filters.status] - 'COMPLETED' | 'FAILED'
   * @param {number} [filters.page=1]
   * @param {number} [filters.limit=20]
   * @returns {Promise<{ settlements: Array<Object>, pagination: Object }>}
   */
  async getSettlements(filters = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase.from("settlements").select("*", { count: "exact" });

      if (filters.retailerId) {
        query = query.eq("retailer_id", filters.retailerId);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      // Newest payouts first
      query = query.order("created_at", { ascending: false });

      // Pagination
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error("Error fetching settlements:", error);
        throw error;
      }

      return {
        settlements: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("settlementRepository.getSettlements failed:", error);
      throw error;
    }
  },

  /**
   * Fetch a single settlement with its associated ledger entries
   * via the settlement_ledger_items mapping table.
   *
   * @param {string} settlementId - UUID of the settlement.
   * @returns {Promise<Object|null>} Settlement with nested ledger items, or null.
   */
  async getSettlementDetails(settlementId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("settlements")
        .select(
          `
          *,
          settlement_ledger_items (
            id,
            allocated_amount,
            seller_ledgers (*)
          )
        `,
        )
        .eq("id", settlementId)
        .single();

      if (error) {
        // Not found
        if (error.code === "PGRST116") return null;
        logger.error("Error fetching settlement details:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("settlementRepository.getSettlementDetails failed:", error);
      throw error;
    }
  },

  /**
   * Admin: Fetch full settlement (payout) history for a specific retailer.
   * Ordered by created_at DESC (newest first).
   *
   * @param {string} retailerId - UUID of the retailer.
   * @returns {Promise<Array<Object>>} All settlement records for the retailer.
   */
  async getSettlementHistoryForRetailer(retailerId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("settlements")
        .select("*")
        .eq("retailer_id", retailerId)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Error fetching settlement history for retailer:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error(
        "settlementRepository.getSettlementHistoryForRetailer failed:",
        error,
      );
      throw error;
    }
  },

  /**
   * Retailer: Fetch a single settlement with its associated ledger entries
   * via the settlement_ledger_items mapping table, secured by retailerId.
   * Includes deep joins for order and product details required by the UI.
   *
   * @param {string} settlementId - UUID of the settlement.
   * @param {string} retailerId - UUID of the retailer.
   * @returns {Promise<Object|null>} Settlement with nested ledger items, or null.
   */
  async getRetailerSettlementDetails(settlementId, retailerId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("settlements")
        .select(
          `
          *,
          settlement_ledger_items (
            id,
            allocated_amount,
            seller_ledgers (
              id, amount, status, trigger_date, transaction_type, entry_type,
              orders!left ( order_number, user_id, created_at, shipping_address ),
              order_items!left ( id, title, sku, quantity, status, dispatch_id )
            )
          )
        `,
        )
        .eq("id", settlementId)
        .eq("retailer_id", retailerId)
        .single();

      if (error) {
        // Not found
        if (error.code === "PGRST116") return null;
        logger.error("Error fetching retailer settlement details:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(
        "settlementRepository.getRetailerSettlementDetails failed:",
        error,
      );
      throw error;
    }
  },
};
