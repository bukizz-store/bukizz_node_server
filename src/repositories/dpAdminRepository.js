import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * DP Admin Repository
 * Data-access layer for admin delivery partner management.
 * Uses getSupabase() directly (matches dpLedgerRepository / deliveryRepository pattern).
 */
export const dpAdminRepository = {
  /**
   * List delivery partners with wallet balance and active order count.
   * Joins users + delivery_partner_data.
   * @param {Object} filters - { page, limit, city, status, kycStatus }
   * @returns {Promise<{ partners: Array, pagination: Object }>}
   */
  async getDeliveryPartnersList(filters = {}) {
    try {
      const supabase = getSupabase();
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
      const offset = (page - 1) * limit;

      // Base query: users who are delivery partners joined with delivery_partner_data
      let query = supabase
        .from("users")
        .select(
          `
          id, full_name, email, phone, is_active, created_at, city,
          delivery_partner_data (
            vehicle_details,
            kyc_status,
            is_cod_eligible
          )
        `,
          { count: "exact" },
        )
        .eq("role", "delivery_partner");

      // Apply city filter
      if (filters.city) {
        query = query.eq("city", filters.city);
      }

      // Apply KYC status filter
      if (filters.kycStatus) {
        query = query.eq(
          "delivery_partner_data.kyc_status",
          filters.kycStatus,
        );
      }

      // Apply active/inactive filter from status
      if (filters.status === "Inactive") {
        query = query.eq("is_active", false);
      } else if (filters.status === "Idle" || filters.status === "In-Transit") {
        query = query.eq("is_active", true);
      }

      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: partners, error, count } = await query;

      if (error) {
        logger.error("Error fetching DP list:", error);
        throw error;
      }

      // Fetch wallet balances and active order counts using batch RPC (N+1 query fix)
      let enriched = partners || [];

      if (partners && partners.length > 0) {
        const dpIds = partners.map(dp => dp.id);

        try {
          // Single batch query for all stats
          const { data: stats, error: statsError } = await supabase.rpc('batch_get_dp_stats', {
            p_dp_ids: dpIds
          });

          if (statsError) {
            logger.error("Batch stats query failed, falling back to individual queries:", statsError);
            // Fallback to individual queries (original behavior)
            enriched = await Promise.all(
              partners.map(async (dp) => {
                const [balance, activeOrderCount] = await Promise.all([
                  this._getWalletBalance(dp.id),
                  this._getActiveOrderCount(dp.id),
                ]);
                return { ...dp, walletBalance: balance, activeOrderCount };
              }),
            );
          } else {
            // Map stats to partners
            const statsMap = new Map((stats || []).map(s => [s.dp_id, s]));
            enriched = partners.map(dp => ({
              ...dp,
              walletBalance: parseFloat(statsMap.get(dp.id)?.wallet_balance || 0),
              activeOrderCount: statsMap.get(dp.id)?.active_order_count || 0,
            }));
          }
        } catch (batchError) {
          logger.error("Batch stats exception, falling back:", batchError);
          // Fallback to individual queries
          enriched = await Promise.all(
            partners.map(async (dp) => {
              const [balance, activeOrderCount] = await Promise.all([
                this._getWalletBalance(dp.id),
                this._getActiveOrderCount(dp.id),
              ]);
              return { ...dp, walletBalance: balance, activeOrderCount };
            }),
          );
        }
      }

      return {
        partners: enriched,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("dpAdminRepository.getDeliveryPartnersList failed:", error);
      throw error;
    }
  },

  /**
   * Get comprehensive DP profile with KYC, bank, and vehicle data.
   * @param {string} dpId
   * @returns {Promise<Object|null>}
   */
  async getDpProfile(dpId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id, full_name, email, phone, is_active, created_at, updated_at, city,
          delivery_partner_data (
            vehicle_details,
            kyc_status,
            documents,
            is_cod_eligible,
            bank_account_name,
            bank_account_number_masked,
            bank_ifsc,
            bank_verification_status,
            razorpay_fund_account_id,
            created_at,
            updated_at
          )
        `,
        )
        .eq("id", dpId)
        .single();

      if (error) {
        logger.error("Error fetching DP profile:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("dpAdminRepository.getDpProfile failed:", error);
      throw error;
    }
  },

  /**
   * Get orders currently assigned to this DP (out_for_delivery).
   * @param {string} dpId
   * @returns {Promise<Array>}
   */
  async getActiveLoadout(dpId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("order_items")
        .select(`
          order_id,
          locked_at,
          dispatch_id,
          orders!inner (
            id, order_number, status, total_amount, payment_method,
            shipping_address, created_at, updated_at
          )
        `)
        .eq("locked_by", dpId)
        .eq("status", "out_for_delivery")
        .order("locked_at", { ascending: true });

      if (error) {
        logger.error("Error fetching DP active loadout:", error);
        throw error;
      }

      // Extract unique orders from the items
      const uniqueOrdersMap = new Map();
      (data || []).forEach((item) => {
        if (!uniqueOrdersMap.has(item.orders.id)) {
          // Use item locked_at as proxy for assignment time
          const order = { ...item.orders, updated_at: item.locked_at, dispatch_id: item.dispatch_id };
          order.status = "out_for_delivery"; 
          uniqueOrdersMap.set(item.orders.id, order);
        }
      });

      return Array.from(uniqueOrdersMap.values());
    } catch (error) {
      logger.error("dpAdminRepository.getActiveLoadout failed:", error);
      throw error;
    }
  },

  /**
   * Get paginated ledger transactions for a DP.
   * @param {string} dpId
   * @param {Object} pagination - { page, limit }
   * @returns {Promise<{ transactions: Array, pagination: Object }>}
   */
  async getDpLedger(dpId, pagination = {}) {
    try {
      const supabase = getSupabase();
      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(pagination.limit) || 20));
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("dp_ledgers")
        .select(
          `id, order_id, transaction_type, amount, description, created_at`,
          { count: "exact" },
        )
        .eq("dp_user_id", dpId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error("Error fetching DP ledger:", error);
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
      logger.error("dpAdminRepository.getDpLedger failed:", error);
      throw error;
    }
  },

  /**
   * Unassign an order from a DP: set status of its items back to shipped, clear locked_by.
   * Also logs the admin action via order_events.
   * @param {string} orderId
   * @param {string} dpId
   * @param {string} reason
   * @param {string} adminId
   * @returns {Promise<Object>} Updated order proxy
   */
  async unassignOrder(orderId, dpId, reason, adminId) {
    try {
      const supabase = getSupabase();

      // 1. Verify the order has items locked by this DP
      const { data: items, error: fetchError } = await supabase
        .from("order_items")
        .select("id, status")
        .eq("order_id", orderId)
        .eq("locked_by", dpId)
        .eq("status", "out_for_delivery");

      if (fetchError) {
        logger.error("Error fetching order items for unassign:", fetchError);
        throw fetchError;
      }

      if (!items || items.length === 0) {
        const err = new Error("No out_for_delivery items found locked by this delivery partner for this order");
        err.statusCode = 400;
        throw err;
      }

      // 2. Update the order_items back to shipped
      const itemIds = items.map(item => item.id);
      const { data: updatedItems, error: updateError } = await supabase
        .from("order_items")
        .update({
          status: "shipped",
          locked_by: null,
          locked_at: null,
        })
        .in("id", itemIds)
        .select();

      if (updateError) {
        logger.error("Error unassigning order items:", updateError);
        throw updateError;
      }

      // 3. Log the event
      await supabase.from("order_events").insert({
        order_id: orderId,
        previous_status: "out_for_delivery",
        new_status: "shipped (admin unassign)",
        changed_by: adminId,
        note: `Admin force-unassigned ${itemIds.length} items from DP ${dpId}. Reason: ${reason}`,
        metadata: { dpId, reason, action: "admin_force_unassign", itemIds },
      });

      return { id: orderId, status: "ready_for_pickup", dp_id: null };
    } catch (error) {
      logger.error("dpAdminRepository.unassignOrder failed:", error);
      throw error;
    }
  },

  /**
   * Get delivered orders history for a DP (paginated).
   * Fetches order items from the dp ledger and resolves to parent orders.
   * @param {string} dpId
   * @param {Object} pagination - { page, limit }
   * @returns {Promise<{ orders: Array, pagination: Object }>}
   */
  async getDeliveryHistory(dpId, pagination = {}) {
    try {
      const supabase = getSupabase();
      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(pagination.limit) || 20));
      const offset = (page - 1) * limit;

      const { data: ledgerEntries, error: ledgerError, count } = await supabase
        .from("dp_ledgers")
        .select("order_id, created_at", { count: "exact" })
        .eq("dp_user_id", dpId)
        .not("order_id", "is", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (ledgerError) {
        logger.error("Error fetching DP history from ledger:", ledgerError);
        throw ledgerError;
      }

      if (!ledgerEntries || ledgerEntries.length === 0) {
        return { orders: [], pagination: { page, limit, total: count || 0, totalPages: 0 } };
      }

      const orderIds = [...new Set(ledgerEntries.map((l) => l.order_id))];

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(
          `
          id, order_number, status, total_amount, payment_method,
          shipping_address, created_at, updated_at,
          order_items ( dispatch_id )
        `
        )
        .in("id", orderIds);

      if (ordersError) {
        logger.error("Error fetching historical orders:", ordersError);
        throw ordersError;
      }
      
      const orderMap = new Map();
      (orders || []).forEach(o => orderMap.set(o.id, o));
      
      const sortedResult = ledgerEntries.map(l => {
          const o = orderMap.get(l.order_id);
          if (o) {
              const dispatch_id = o.order_items?.[0]?.dispatch_id || null;
              return { ...o, updated_at: l.created_at, dispatch_id };
          }
          return null;
      }).filter(Boolean);

      return {
        orders: sortedResult,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("dpAdminRepository.getDeliveryHistory failed:", error);
      throw error;
    }
  },

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * Get wallet balance for a DP (sum of all dp_ledger amounts).
   * @param {string} dpId
   * @returns {Promise<number>}
   */
  async _getWalletBalance(dpId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("dp_ledgers")
        .select("amount")
        .eq("dp_user_id", dpId);

      if (error) {
        logger.error("Error fetching DP wallet balance:", error);
        return 0;
      }

      const total = (data || []).reduce(
        (sum, row) => sum + parseFloat(row.amount || 0),
        0,
      );

      return parseFloat(total.toFixed(2));
    } catch (error) {
      logger.error("dpAdminRepository._getWalletBalance failed:", error);
      return 0;
    }
  },

  /**
   * Get count of active (out_for_delivery) unique orders for a DP.
   * @param {string} dpId
   * @returns {Promise<number>}
   */
  async _getActiveOrderCount(dpId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("order_items")
        .select("order_id")
        .eq("locked_by", dpId)
        .eq("status", "out_for_delivery");

      if (error) {
        logger.error("Error fetching DP active order count:", error);
        return 0;
      }

      const uniqueOrders = new Set((data || []).map((item) => item.order_id));
      return uniqueOrders.size;
    } catch (error) {
      logger.error("dpAdminRepository._getActiveOrderCount failed:", error);
      return 0;
    }
  },

  /**
   * Insert a transaction into DP Ledger.
   */
  async insertLedgerTransaction(dpId, amount, type, description) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("dp_ledgers")
        .insert({
          dp_user_id: dpId,
          transaction_type: type,
          amount: amount,
          description: description,
        })
        .select()
        .single();
        
      if (error) {
        logger.error("Error inserting DP ledger transaction:", error);
        throw error;
      }
      return data;
    } catch (error) {
      logger.error("dpAdminRepository.insertLedgerTransaction failed:", error);
      throw error;
    }
  },

  /**
   * Update COD Eligibility
   */
  async updateCodEligibility(dpId, isCodEligible) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("delivery_partner_data")
        .update({ is_cod_eligible: isCodEligible })
        .eq("user_id", dpId)
        .select();

      if (error) {
        logger.error("Error updating COD eligibility:", error);
        throw error;
      }
      return data?.[0];
    } catch (error) {
      logger.error("dpAdminRepository.updateCodEligibility failed:", error);
      throw error;
    }
  },
};
