import { executeSupabaseQuery, getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Order Item Component Repository
 * Handles insertion and querying of immutable component-level GST tax breakdowns
 * for orders (both kits and single items).
 */
export const orderItemComponentRepository = {
  /**
   * Bulk insert component records for an order.
   *
   * @param {Array<Object>} components - Array of component records
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async bulkCreate(components = [], connection = null) {
    if (!components || components.length === 0) return [];

    const rowsToInsert = components.map((c, idx) => ({
      order_item_id: c.orderItemId || c.order_item_id,
      component_title: c.componentTitle || c.component_title || c.title || "Item Component",
      quantity: Number(c.quantity || 1),
      unit_price: Number(c.unitPrice ?? c.unit_price ?? 0),
      total_price: Number(c.totalPrice ?? c.total_price ?? 0),
      hsn_sac_code: c.hsnSacCode || c.hsn_sac_code || "4901",
      gst_rate: Number(c.gstRate ?? c.gst_rate ?? 0.0),
      base_price: Number(c.basePrice ?? c.base_price ?? 0),
      cgst_amount: Number(c.cgstAmount ?? c.cgst_amount ?? 0),
      sgst_amount: Number(c.sgstAmount ?? c.sgst_amount ?? 0),
      igst_amount: Number(c.igstAmount ?? c.igst_amount ?? 0),
      sort_order: c.sortOrder ?? c.sort_order ?? idx,
    }));

    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("order_item_components")
          .insert(rowsToInsert)
          .select(),
      { connection, context: "OrderItemComponentRepository.bulkCreate" }
    );
  },

  /**
   * Fetch components for a specific order_item_id, ordered by sort_order.
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
          .from("order_item_components")
          .select("*")
          .eq("order_item_id", orderItemId)
          .order("sort_order", { ascending: true }),
      { connection, context: "OrderItemComponentRepository.getByOrderItemId" }
    );
  },

  /**
   * Batch-fetch components for multiple order_item_ids.
   *
   * @param {Array<string>} orderItemIds - Array of order_item UUIDs
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async getByOrderItemIds(orderItemIds = [], connection = null) {
    if (!orderItemIds || orderItemIds.length === 0) return [];
    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("order_item_components")
          .select("*")
          .in("order_item_id", orderItemIds)
          .order("sort_order", { ascending: true }),
      { connection, context: "OrderItemComponentRepository.getByOrderItemIds" }
    );
  },
};

export class OrderItemComponentRepository {
  constructor(deps = {}) {
    this.supabase = deps.supabase || getSupabase();
  }

  async bulkCreate(components, connection = null) {
    return orderItemComponentRepository.bulkCreate(components, connection || this.supabase);
  }

  async getByOrderItemId(orderItemId, connection = null) {
    return orderItemComponentRepository.getByOrderItemId(orderItemId, connection || this.supabase);
  }

  async getByOrderItemIds(orderItemIds, connection = null) {
    return orderItemComponentRepository.getByOrderItemIds(orderItemIds, connection || this.supabase);
  }
}
