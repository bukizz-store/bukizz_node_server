import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Ledger Repository
 * Handles all seller_ledgers table operations.
 * Pure data-access layer — no business logic.
 */
export const ledgerRepository = {
  /**
   * Bulk insert multiple ledger entries (e.g., ORDER_REVENUE + PLATFORM_FEE).
   * @param {Array<Object>} entriesArray - Array of ledger row objects (snake_case).
   * @returns {Promise<Array<Object>>} Inserted rows.
   */
  async createEntries(entriesArray) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("seller_ledgers")
        .insert(entriesArray)
        .select();

      if (error) {
        logger.error("Error bulk-inserting ledger entries:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("ledgerRepository.createEntries failed:", error);
      throw error;
    }
  },

  /**
   * Fetch ledger rows eligible for FIFO settlement.
   * Returns rows with status IN ('AVAILABLE', 'PARTIALLY_SETTLED')
   * ordered by trigger_date ASC (oldest first) to enforce FIFO.
   *
   * @param {string} retailerId - UUID of the retailer.
   * @returns {Promise<Array<Object>>} Eligible ledger rows sorted FIFO.
   */
  async getAvailableForSettlement(retailerId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("seller_ledgers")
        .select("*")
        .eq("retailer_id", retailerId)
        .in("status", ["AVAILABLE", "PARTIALLY_SETTLED"])
        .order("trigger_date", { ascending: true });

      if (error) {
        logger.error("Error fetching available ledger entries:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error("ledgerRepository.getAvailableForSettlement failed:", error);
      throw error;
    }
  },

  /**
   * Get the settlement dashboard summary using the Supabase RPC.
   *
   * @param {string} retailerId
   * @param {string} warehouseId
   * @returns {Promise<Object>}
   */
  async getDashboardSummary(retailerId, warehouseId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase.rpc(
        "get_warehouse_settlement_summary",
        {
          p_retailer_id: retailerId,
          p_warehouse_id: warehouseId,
        },
      );

      if (error) {
        logger.error("ledgerRepository.getDashboardSummary RPC failed:", error);
        throw error;
      }

      // RPC returns a table/array, usually with one row
      return data && data.length > 0
        ? data[0]
        : {
            total_orders: 0,
            total_sales: 0,
            to_be_settled: 0,
            next_settlement_amount: 0,
            next_settlement_date: null,
            last_settlement_date: null,
          };
    } catch (error) {
      logger.error("ledgerRepository.getDashboardSummary failed:", error);
      throw error;
    }
  },

  /**
   * Fetch filtered & paginated ledger history.
   *
   * @param {Object} filters
   * @param {string}  [filters.retailerId]
   * @param {string}  [filters.warehouseId]
   * @param {string}  [filters.status]          - One of ledger_status enum.
   * @param {string}  [filters.transactionType] - One of ledger_transaction_type enum.
   * @param {string}  [filters.startDate]       - ISO date string.
   * @param {string}  [filters.endDate]         - ISO date string.
   * @param {number}  [filters.page=1]
   * @param {number}  [filters.limit=20]
   * @returns {Promise<{ entries: Array<Object>, pagination: Object }>}
   */
  async getHistory(filters = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase.from("seller_ledgers").select(
        `
          id, amount, status, trigger_date, transaction_type, entry_type, created_at,
          orders!left ( order_number, user_id, created_at ),
          order_items!left ( title, sku, status, quantity ,dispatch_id)
        `,
        { count: "exact" },
      );

      // Apply filters
      if (filters.retailerId) {
        query = query.eq("retailer_id", filters.retailerId);
      }
      if (filters.warehouseId) {
        query = query.eq("warehouse_id", filters.warehouseId);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      if (filters.transactionType) {
        query = query.eq("transaction_type", filters.transactionType);
      }
      if (filters.startDate) {
        query = query.gte("created_at", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("created_at", filters.endDate);
      }

      // Ordering — newest first for history view
      query = query.order("created_at", { ascending: false });

      // Pagination
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error("Error fetching ledger history:", error);
        throw error;
      }

      return {
        entries: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("ledgerRepository.getHistory failed:", error);
      throw error;
    }
  },
};
