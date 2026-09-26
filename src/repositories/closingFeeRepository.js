import { executeSupabaseQuery } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Closing Fee Repository
 * Handles operations on tiered closing fee brackets via executeSupabaseQuery.
 */
export class ClosingFeeRepository {
  /**
   * Fetch all active closing fee slabs ordered by min_price ASC.
   * @returns {Promise<Array<Object>>} Slabs sorted by min_price ascending.
   */
  async getAllActive() {
    try {
      const rows = await executeSupabaseQuery("closing_fee_slabs", "select", {
        eq: { is_active: true },
        order: { column: "min_price", ascending: true },
      });

      return rows || [];
    } catch (error) {
      logger.error("Error in closingFeeRepository.getAllActive:", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a new closing fee slab.
   * Inserts min_price, max_price, fee_amount, is_active.
   * @param {Object} data - Slab creation payload.
   * @returns {Promise<Object>} Created slab row.
   */
  async create(data) {
    try {
      const minPrice =
        data.minPrice !== undefined ? data.minPrice : data.min_price;
      const maxPrice =
        data.maxPrice !== undefined ? data.maxPrice : data.max_price;
      const feeAmount =
        data.feeAmount !== undefined ? data.feeAmount : data.fee_amount;

      const payload = {
        min_price: Number(minPrice),
        max_price:
          maxPrice !== null && maxPrice !== undefined ? Number(maxPrice) : null,
        fee_amount: Number(feeAmount),
        is_active:
          data.isActive !== undefined
            ? Boolean(data.isActive)
            : data.is_active !== undefined
            ? Boolean(data.is_active)
            : true,
      };

      const rows = await executeSupabaseQuery("closing_fee_slabs", "insert", {
        data: payload,
        select: "*",
      });

      return rows && rows.length > 0 ? rows[0] : rows;
    } catch (error) {
      logger.error("Error in closingFeeRepository.create:", {
        data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update an existing closing fee slab by ID.
   * Updates fields and updated_at.
   * @param {string} id - UUID of closing fee slab.
   * @param {Object} updates - Update payload.
   * @returns {Promise<Object|null>} Updated slab row or null.
   */
  async update(id, updates) {
    try {
      const payload = {
        updated_at: new Date().toISOString(),
      };

      if (
        updates.minPrice !== undefined ||
        updates.min_price !== undefined
      ) {
        const val =
          updates.minPrice !== undefined ? updates.minPrice : updates.min_price;
        payload.min_price = Number(val);
      }

      if (
        updates.maxPrice !== undefined ||
        updates.max_price !== undefined
      ) {
        const val =
          updates.maxPrice !== undefined ? updates.maxPrice : updates.max_price;
        payload.max_price = val !== null && val !== undefined ? Number(val) : null;
      }

      if (
        updates.feeAmount !== undefined ||
        updates.fee_amount !== undefined
      ) {
        const val =
          updates.feeAmount !== undefined
            ? updates.feeAmount
            : updates.fee_amount;
        payload.fee_amount = Number(val);
      }

      if (updates.isActive !== undefined || updates.is_active !== undefined) {
        payload.is_active =
          updates.isActive !== undefined
            ? Boolean(updates.isActive)
            : Boolean(updates.is_active);
      }

      const rows = await executeSupabaseQuery("closing_fee_slabs", "update", {
        eq: { id },
        data: payload,
        select: "*",
      });

      return rows && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error("Error in closingFeeRepository.update:", {
        id,
        updates,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a closing fee slab by ID (hard delete).
   * @param {string} id - UUID of closing fee slab to delete.
   * @returns {Promise<boolean>} True if deletion succeeded.
   */
  async delete(id) {
    try {
      await executeSupabaseQuery("closing_fee_slabs", "delete", {
        eq: { id },
      });

      return true;
    } catch (error) {
      logger.error("Error in closingFeeRepository.delete:", {
        id,
        error: error.message,
      });
      throw error;
    }
  }
}

export const closingFeeRepository = new ClosingFeeRepository();
export default closingFeeRepository;
