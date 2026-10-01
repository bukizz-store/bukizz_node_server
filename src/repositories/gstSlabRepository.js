import { executeSupabaseQuery } from "../db/index.js";
import { logger } from "../utils/logger.js";

let _cachedActiveSlabs = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL

/**
 * Invalidate in-memory active GST slabs cache
 */
export function invalidateGstSlabCache() {
  _cachedActiveSlabs = null;
  _cacheTimestamp = 0;
}

/**
 * GST Slab Repository
 * Handles all database operations for the gst_slabs table via executeSupabaseQuery
 * with high-performance in-memory caching for active slabs.
 */
export class GstSlabRepository {
  /**
   * Find all active GST tax slabs, ordered by rate percentage ascending.
   * Utilizes in-memory caching with 10-minute TTL to eliminate redundant network queries.
   * @param {boolean} [forceRefresh=false] - Force bypass cache
   * @returns {Promise<Array<Object>>} List of active GST slabs.
   */
  async findAllActive(forceRefresh = false) {
    try {
      const now = Date.now();
      if (!forceRefresh && _cachedActiveSlabs && now - _cacheTimestamp < CACHE_TTL_MS) {
        return _cachedActiveSlabs;
      }

      const rows = await executeSupabaseQuery("gst_slabs", "select", {
        eq: { is_active: true },
        order: { column: "rate_percentage", ascending: true },
      });

      _cachedActiveSlabs = rows || [];
      _cacheTimestamp = now;
      return _cachedActiveSlabs;
    } catch (error) {
      if (_cachedActiveSlabs) {
        logger.warn(
          "Query failed in gstSlabRepository.findAllActive, returning stale cache:",
          error.message
        );
        return _cachedActiveSlabs;
      }
      logger.error("Error in gstSlabRepository.findAllActive:", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Find a GST slab by its UUID.
   * Checks cached active slabs first for instant resolution.
   * @param {string} id - UUID of the GST slab.
   * @returns {Promise<Object|null>} Found GST slab or null.
   */
  async findById(id) {
    try {
      if (_cachedActiveSlabs) {
        const cached = _cachedActiveSlabs.find((s) => s.id === id);
        if (cached) return cached;
      }

      const rows = await executeSupabaseQuery("gst_slabs", "select", {
        eq: { id },
        range: { from: 0, to: 0 },
      });

      return rows && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error("Error in gstSlabRepository.findById:", {
        id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a new GST slab record and invalidate cache.
   * @param {Object} data - Creation payload.
   * @returns {Promise<Object>} Created GST slab row.
   */
  async create(data) {
    try {
      const payload = {
        rate_percentage:
          data.ratePercentage !== undefined
            ? Number(data.ratePercentage)
            : Number(data.rate_percentage),
        hsn_sac_code:
          data.hsnSacCode !== undefined ? data.hsnSacCode : data.hsn_sac_code,
        description: data.description !== undefined ? data.description : null,
        is_active:
          data.isActive !== undefined
            ? Boolean(data.isActive)
            : data.is_active !== undefined
            ? Boolean(data.is_active)
            : true,
      };

      const rows = await executeSupabaseQuery("gst_slabs", "insert", {
        data: payload,
        select: "*",
      });

      invalidateGstSlabCache();

      return rows && rows.length > 0 ? rows[0] : rows;
    } catch (error) {
      logger.error("Error in gstSlabRepository.create:", {
        data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update an existing GST slab by ID and invalidate cache.
   * @param {string} id - UUID of the GST slab to update.
   * @param {Object} updates - Update payload.
   * @returns {Promise<Object|null>} Updated GST slab row or null.
   */
  async update(id, updates) {
    try {
      const payload = {
        updated_at: new Date().toISOString(),
      };

      if (
        updates.ratePercentage !== undefined ||
        updates.rate_percentage !== undefined
      ) {
        payload.rate_percentage =
          updates.ratePercentage !== undefined
            ? Number(updates.ratePercentage)
            : Number(updates.rate_percentage);
      }

      if (
        updates.hsnSacCode !== undefined ||
        updates.hsn_sac_code !== undefined
      ) {
        payload.hsn_sac_code =
          updates.hsnSacCode !== undefined
            ? updates.hsnSacCode
            : updates.hsn_sac_code;
      }

      if (updates.description !== undefined) {
        payload.description = updates.description;
      }

      if (updates.isActive !== undefined || updates.is_active !== undefined) {
        payload.is_active =
          updates.isActive !== undefined
            ? Boolean(updates.isActive)
            : Boolean(updates.is_active);
      }

      const rows = await executeSupabaseQuery("gst_slabs", "update", {
        eq: { id },
        data: payload,
        select: "*",
      });

      invalidateGstSlabCache();

      return rows && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error("Error in gstSlabRepository.update:", {
        id,
        updates,
        error: error.message,
      });
      throw error;
    }
  }
}

export const gstSlabRepository = new GstSlabRepository();
export default gstSlabRepository;
