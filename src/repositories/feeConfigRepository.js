import { executeSupabaseQuery } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Fee Configuration Repository
 * Handles all database operations for system fee configurations via executeSupabaseQuery.
 */
export class FeeConfigRepository {
  /**
   * Retrieve all fee configurations.
   * @returns {Promise<Array<Object>>} List of all fee configuration rows.
   */
  async getAll() {
    try {
      const rows = await executeSupabaseQuery("fee_configurations", "select", {
        order: { column: "config_key", ascending: true },
      });

      return rows || [];
    } catch (error) {
      logger.error("Error in feeConfigRepository.getAll:", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Queries active fees and reduces them into an object keyed by config_key:
   * { [config_key]: { amount: Number, feeType: String, gstRate: Number } }
   * Also supports numeric coercion via valueOf() for backwards compatibility.
   * @returns {Promise<Object>} Key-value map of configuration key to fee config object.
   */
  async getMap() {
    try {
      const rows = await executeSupabaseQuery("fee_configurations", "select", {
        eq: { is_active: true },
      });

      const map = {};

      (rows || []).forEach((row) => {
        const numericAmount = Number(row.amount);
        const numericGstRate = Number(row.gst_rate);
        const feeType = row.fee_type;

        // Structured entry matching the required signature
        const entry = {
          amount: numericAmount,
          feeType: feeType,
          gstRate: numericGstRate,
          // Support numeric coercion (e.g. Number(feeMap.VENDOR_PLATFORM_FEE) or +feeMap.VENDOR_PLATFORM_FEE)
          valueOf() {
            return this.amount;
          },
          [Symbol.toPrimitive](hint) {
            return this.amount;
          },
        };

        map[row.config_key] = entry;
      });

      return map;
    } catch (error) {
      logger.error("Error in feeConfigRepository.getMap:", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update a fee configuration by its config_key.
   * Updates amount, fee_type, gst_rate, is_active, updated_by, updated_at.
   * @param {string} key - Unique configuration key (e.g. 'VENDOR_PLATFORM_FEE').
   * @param {Object} data - Updated configuration values.
   * @param {string} [userId] - UUID of the user performing the update.
   * @returns {Promise<Object|null>} Updated configuration row or null.
   */
  async updateConfig(key, data, userId) {
    try {
      const payload = {
        updated_at: new Date().toISOString(),
      };

      if (userId) {
        payload.updated_by = userId;
      }

      if (data.amount !== undefined) {
        payload.amount = Number(data.amount);
      }

      if (data.feeType !== undefined || data.fee_type !== undefined) {
        payload.fee_type = data.feeType || data.fee_type;
      }

      if (data.gstRate !== undefined || data.gst_rate !== undefined) {
        payload.gst_rate = Number(
          data.gstRate !== undefined ? data.gstRate : data.gst_rate
        );
      }

      if (data.isActive !== undefined || data.is_active !== undefined) {
        payload.is_active = Boolean(
          data.isActive !== undefined ? data.isActive : data.is_active
        );
      }

      if (data.description !== undefined) {
        payload.description = data.description;
      }

      if (data.name !== undefined) {
        payload.name = data.name;
      }

      const rows = await executeSupabaseQuery("fee_configurations", "update", {
        eq: { config_key: key },
        data: payload,
        select: "*",
      });

      return rows && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error("Error in feeConfigRepository.updateConfig:", {
        key,
        data,
        userId,
        error: error.message,
      });
      throw error;
    }
  }
}

export const feeConfigRepository = new FeeConfigRepository();
export default feeConfigRepository;
