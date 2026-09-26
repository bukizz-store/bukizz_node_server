import { executeSupabaseQuery, getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Order Item Fee Repository
 * Handles insertion and querying of itemized fee deductions and customer surcharges
 * (Commission, Closing Fee, Platform Fee, Collection Fee, Shipping Fee, Delivery Fee, TCS)
 * segregated by payer_party (USER vs VENDOR vs ADMIN).
 */
export const orderItemFeeRepository = {
  /**
   * Bulk insert fee records for an order.
   *
   * @param {Array<Object>} fees - Array of fee records
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async bulkCreate(fees = [], connection = null) {
    if (!fees || fees.length === 0) return [];

    const rowsToInsert = fees.map((f) => ({
      order_item_id: f.orderItemId || f.order_item_id,
      retailer_id: f.retailerId || f.retailer_id || null,
      payer_party: (f.payerParty || f.payer_party || "VENDOR").toUpperCase(),
      fee_code: f.feeCode || f.fee_code,
      fee_name: f.feeName || f.fee_name || f.name,
      calculation_type: (f.calculationType || f.calculation_type || "FLAT").toUpperCase(),
      applied_rate: f.appliedRate !== undefined ? Number(f.appliedRate) : f.applied_rate !== undefined ? Number(f.applied_rate) : null,
      taxable_amount: Number(f.taxableAmount ?? f.taxable_amount ?? 0),
      gst_rate: Number(f.gstRate ?? f.gst_rate ?? 18.00),
      hsn_sac_code: f.hsnSacCode || f.hsn_sac_code || "9983",
      cgst_amount: Number(f.cgstAmount ?? f.cgst_amount ?? 0),
      sgst_amount: Number(f.sgstAmount ?? f.sgst_amount ?? 0),
      igst_amount: Number(f.igstAmount ?? f.igst_amount ?? 0),
      total_fee_amount: Number(f.totalFeeAmount ?? f.total_fee_amount ?? f.totalAmount ?? f.total_amount ?? 0),
    }));

    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("order_item_fees")
          .insert(rowsToInsert)
          .select(),
      { connection, context: "OrderItemFeeRepository.bulkCreate" }
    );
  },

  /**
   * Fetch all fees for a specific order_item_id.
   *
   * @param {string} orderItemId - UUID of order_item
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async getByOrderItemId(orderItemId, connection = null) {
    if (!orderItemId) return [];
    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("order_item_fees")
          .select("*")
          .eq("order_item_id", orderItemId),
      { connection, context: "OrderItemFeeRepository.getByOrderItemId" }
    );
  },

  /**
   * Batch-fetch fees for multiple order_item_ids.
   *
   * @param {Array<string>} orderItemIds - Array of order_item UUIDs
   * @param {string} [payerParty] - Optional filter by 'USER' or 'VENDOR'
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async getByOrderItemIds(orderItemIds = [], payerParty = null, connection = null) {
    if (!orderItemIds || orderItemIds.length === 0) return [];
    return executeSupabaseQuery(
      (supabase) => {
        let q = supabase.from("order_item_fees").select("*").in("order_item_id", orderItemIds);
        if (payerParty) {
          q = q.eq("payer_party", payerParty.toUpperCase());
        }
        return q;
      },
      { connection, context: "OrderItemFeeRepository.getByOrderItemIds" }
    );
  },

  /**
   * Fetch vendor deductions for settlement statement and B2B GST tax invoice generation.
   *
   * @param {string} retailerId - UUID of retailer
   * @param {string} [startDate] - ISO timestamp
   * @param {string} [endDate] - ISO timestamp
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async getVendorFees(retailerId, startDate = null, endDate = null, connection = null) {
    if (!retailerId) return [];
    return executeSupabaseQuery(
      (supabase) => {
        let q = supabase
          .from("order_item_fees")
          .select("*")
          .eq("retailer_id", retailerId)
          .eq("payer_party", "VENDOR");

        if (startDate) q = q.gte("created_at", startDate);
        if (endDate) q = q.lte("created_at", endDate);

        return q.order("created_at", { ascending: true });
      },
      { connection, context: "OrderItemFeeRepository.getVendorFees" }
    );
  },
};

export class OrderItemFeeRepository {
  constructor(deps = {}) {
    this.supabase = deps.supabase || getSupabase();
  }

  async bulkCreate(fees, connection = null) {
    return orderItemFeeRepository.bulkCreate(fees, connection || this.supabase);
  }

  async getByOrderItemId(orderItemId, connection = null) {
    return orderItemFeeRepository.getByOrderItemId(orderItemId, connection || this.supabase);
  }

  async getByOrderItemIds(orderItemIds, payerParty = null, connection = null) {
    return orderItemFeeRepository.getByOrderItemIds(orderItemIds, payerParty, connection || this.supabase);
  }

  async getVendorFees(retailerId, startDate = null, endDate = null, connection = null) {
    return orderItemFeeRepository.getVendorFees(retailerId, startDate, endDate, connection || this.supabase);
  }
}
