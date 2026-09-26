import { executeSupabaseQuery, getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Product Fee Repository
 * Handles product-level and variant-level fee assignments, determining payer party,
 * calculation type, and applicable GST rate.
 */
export const productFeeRepository = {
  /**
   * Fetch active fee configurations for a single product.
   *
   * @param {string} productId - Product UUID
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async getByProductId(productId, connection = null) {
    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("product_fees")
          .select("*")
          .eq("product_id", productId)
          .eq("is_enabled", true),
      { connection, context: "ProductFeeRepository.getByProductId" }
    );
  },

  /**
   * Batch-fetch active fee configurations for multiple product IDs.
   *
   * @param {Array<string>} productIds - Array of product UUIDs
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async getByProductIds(productIds, connection = null) {
    if (!productIds || productIds.length === 0) return [];
    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("product_fees")
          .select("*")
          .in("product_id", productIds)
          .eq("is_enabled", true),
      { connection, context: "ProductFeeRepository.getByProductIds" }
    );
  },

  /**
   * Fetch active fee configurations for a specific variant.
   *
   * @param {string} variantId - Variant UUID
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async getByVariantId(variantId, connection = null) {
    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("product_fees")
          .select("*")
          .eq("variant_id", variantId)
          .eq("is_enabled", true),
      { connection, context: "ProductFeeRepository.getByVariantId" }
    );
  },

  /**
   * Save or replace product fee configurations.
   * Deletes existing configurations for the specified product and inserts the new set.
   *
   * @param {string} productId - Product UUID
   * @param {Array<Object>} fees - Array of fee configuration objects
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<Array<Object>>}
   */
  async saveProductFees(productId, fees = [], connection = null) {
    if (!productId) throw new Error("productId is required for saveProductFees");

    // 1. Delete existing fees for this product
    await executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("product_fees")
          .delete()
          .eq("product_id", productId),
      { connection, context: "ProductFeeRepository.deleteOldFees" }
    );

    if (!fees || fees.length === 0) return [];

    // 2. Prepare payload
    const rowsToInsert = fees.map((f) => ({
      product_id: productId,
      variant_id: f.variantId || f.variant_id || null,
      fee_code: f.feeCode || f.fee_code,
      fee_name: f.feeName || f.fee_name || f.name,
      payer_party: (f.payerParty || f.payer_party || "VENDOR").toUpperCase(),
      calculation_type: (f.calculationType || f.calculation_type || "FLAT").toUpperCase(),
      amount_or_rate: Number(f.amountOrRate ?? f.amount_or_rate ?? f.amount ?? f.rate ?? 0),
      gst_rate: Number(f.gstRate ?? f.gst_rate ?? 18.00),
      hsn_sac_code: f.hsnSacCode || f.hsn_sac_code || "9983",
      is_enabled: f.isEnabled !== undefined ? Boolean(f.isEnabled) : f.is_enabled !== undefined ? Boolean(f.is_enabled) : true,
    }));

    return executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("product_fees")
          .insert(rowsToInsert)
          .select(),
      { connection, context: "ProductFeeRepository.insertNewFees" }
    );
  },

  /**
   * Delete fee configurations for a product.
   *
   * @param {string} productId - Product UUID
   * @param {Object} [connection] - Optional client/transaction connection
   * @returns {Promise<boolean>}
   */
  async deleteByProductId(productId, connection = null) {
    await executeSupabaseQuery(
      (supabase) =>
        supabase
          .from("product_fees")
          .delete()
          .eq("product_id", productId),
      { connection, context: "ProductFeeRepository.deleteByProductId" }
    );
    return true;
  },
};

export class ProductFeeRepository {
  constructor(deps = {}) {
    this.supabase = deps.supabase || getSupabase();
  }

  async getByProductId(productId, connection = null) {
    return productFeeRepository.getByProductId(productId, connection || this.supabase);
  }

  async getByProductIds(productIds, connection = null) {
    return productFeeRepository.getByProductIds(productIds, connection || this.supabase);
  }

  async saveProductFees(productId, fees, connection = null) {
    return productFeeRepository.saveProductFees(productId, fees, connection || this.supabase);
  }
}
