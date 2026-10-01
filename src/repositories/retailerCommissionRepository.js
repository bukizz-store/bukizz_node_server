import { executeSupabaseQuery } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Retailer Commission Repository
 * Handles vendor-specific commission overrides and rules via executeSupabaseQuery.
 */
export class RetailerCommissionRepository {
  /**
   * Retrieve all active commission rules configured for a specific retailer with joined category details.
   * @param {string} retailerId - UUID of retailer (from users table).
   * @returns {Promise<Array<Object>>} List of commission rule rows.
   */
  async getByRetailerId(retailerId) {
    try {
      const rows = await executeSupabaseQuery("retailer_commissions", "select", {
        select: "*, categories(id, name)",
        eq: { retailer_id: retailerId, is_active: true },
        order: { column: "created_at", ascending: false },
      });

      return rows || [];
    } catch (error) {
      logger.error("Error in retailerCommissionRepository.getByRetailerId:", {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Upsert a retailer commission rule with conflict resolution on (retailer_id, product_type, category_id).
   * @param {Object} data - Commission payload.
   * @returns {Promise<Object>} Inserted or updated commission row.
   */
  async upsertCommission(data) {
    try {
      const retailerId = data.retailerId || data.retailer_id;
      const productType =
        data.productType !== undefined ? data.productType : data.product_type || null;
      const categoryId =
        data.categoryId !== undefined ? data.categoryId : data.category_id || null;
      const commissionPercentage =
        data.commissionPercentage !== undefined
          ? data.commissionPercentage
          : data.commission_percentage;

      const payload = {
        retailer_id: retailerId,
        product_type: productType,
        category_id: categoryId,
        commission_percentage: Number(commissionPercentage),
        is_active:
          data.isActive !== undefined
            ? Boolean(data.isActive)
            : data.is_active !== undefined
            ? Boolean(data.is_active)
            : true,
        updated_at: new Date().toISOString(),
      };

      if (data.id) {
        payload.id = data.id;
      }

      const rows = await executeSupabaseQuery("retailer_commissions", "upsert", {
        data: payload,
        onConflict: "retailer_id, product_type, category_id",
        select: "*, categories(id, name)",
      });

      return rows && rows.length > 0 ? rows[0] : rows;
    } catch (error) {
      logger.error("Error in retailerCommissionRepository.upsertCommission:", {
        data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a commission rule by ID.
   * @param {string} id - UUID of retailer_commissions row.
   * @returns {Promise<boolean>} True if deletion succeeded.
   */
  async deleteCommission(id) {
    try {
      await executeSupabaseQuery("retailer_commissions", "delete", {
        eq: { id },
      });

      return true;
    } catch (error) {
      logger.error("Error in retailerCommissionRepository.deleteCommission:", {
        id,
        error: error.message,
      });
      throw error;
    }
  }
}

export const retailerCommissionRepository = new RetailerCommissionRepository();
export default retailerCommissionRepository;
