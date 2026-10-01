import { executeSupabaseQuery } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { gstSlabRepository } from "./gstSlabRepository.js";

/**
 * Variant Component Repository
 * Handles operations for loose kit components & GST bifurcation via executeSupabaseQuery.
 */
export class VariantComponentRepository {
  /**
   * Queries variant_components join gst_slabs (id, rate_percentage, hsn_sac_code, description)
   * where parent_variant_id = parentVariantId and is_active = true ordered by sort_order ASC.
   * @param {string} parentVariantId - UUID of parent product variant.
   * @returns {Promise<Array<Object>>} List of component rows.
   */
  async getByParentVariantId(parentVariantId) {
    try {
      const rows = await executeSupabaseQuery("variant_components", "select", {
        select: "*, gst_slabs(id, rate_percentage, hsn_sac_code, description)",
        eq: { parent_variant_id: parentVariantId, is_active: true },
        order: { column: "sort_order", ascending: true },
      });

      return rows || [];
    } catch (error) {
      logger.error(
        "Error in variantComponentRepository.getByParentVariantId:",
        {
          parentVariantId,
          error: error.message,
        }
      );
      throw error;
    }
  }

  /**
   * Atomically replace components for a parent variant:
   * 1. Deletes all existing rows for parent_variant_id
   * 2. Inserts new array with parent_variant_id, component_title, quantity, unit_price, compare_at_price, gst_slab_id, hsn_sac_code, sort_order
   * @param {string} parentVariantId - UUID of parent product variant.
   * @param {Array<Object>} components - New components array.
   * @returns {Promise<Array<Object>>} Newly inserted component rows.
   */
  async replaceComponentsForVariant(parentVariantId, components = []) {
    try {
      // 1. Delete all existing rows for parent_variant_id
      await this.deleteByParentVariantId(parentVariantId);

      if (!components || components.length === 0) {
        return [];
      }

      // Fetch active GST slabs (from in-memory cache) to safely resolve any client fallback dummy IDs or rates
      let activeSlabs = [];
      try {
        activeSlabs = await gstSlabRepository.findAllActive();
      } catch (slabErr) {
        logger.warn("Could not query active slabs in replaceComponentsForVariant:", slabErr.message);
      }

      const activeSlabMap = new Map((activeSlabs || []).map((s) => [s.id, s]));
      const activeSlabByRate = new Map(
        (activeSlabs || []).map((s) => [Number(s.rate_percentage), s])
      );
      const defaultSlab = (activeSlabs && activeSlabs[0]) || null;

      const fallbackUuidRateMap = {
        "00000000-0000-0000-0000-000000000000": 0,
        "00000000-0000-0000-0000-000000000001": 5,
        "00000000-0000-0000-0000-000000000002": 12,
        "00000000-0000-0000-0000-000000000003": 18,
        "00000000-0000-0000-0000-000000000004": 28,
      };

      // 2. Map and insert new component items
      const rowsToInsert = components.map((comp, index) => {
        let slabId = comp.gstSlabId !== undefined ? comp.gstSlabId : comp.gst_slab_id;
        let hsn = comp.hsnSacCode !== undefined ? comp.hsnSacCode : comp.hsn_sac_code;

        // Resolve fallback dummy UUID or missing ID by rate
        if (slabId && fallbackUuidRateMap[slabId] !== undefined) {
          const targetRate = fallbackUuidRateMap[slabId];
          const matched = activeSlabByRate.get(targetRate);
          if (matched) {
            slabId = matched.id;
            hsn = hsn || matched.hsn_sac_code;
          }
        } else if ((!slabId || !activeSlabMap.has(slabId)) && comp.gstRate !== undefined) {
          const matched = activeSlabByRate.get(Number(comp.gstRate));
          if (matched) {
            slabId = matched.id;
            hsn = hsn || matched.hsn_sac_code;
          }
        }

        if (!slabId || !activeSlabMap.has(slabId)) {
          if (defaultSlab) {
            slabId = defaultSlab.id;
            hsn = hsn || defaultSlab.hsn_sac_code;
          }
        }

        const unitPrice = Number(
          comp.unitPrice !== undefined ? comp.unitPrice : comp.unit_price || 0
        );
        const compareAtPrice = Number(
          comp.compareAtPrice !== undefined
            ? comp.compareAtPrice
            : comp.compare_at_price !== undefined
            ? comp.compare_at_price
            : unitPrice
        );

        return {
          parent_variant_id: parentVariantId,
          component_title:
            comp.componentTitle !== undefined
              ? comp.componentTitle
              : comp.component_title,
          quantity: Number(comp.quantity !== undefined ? comp.quantity : 1),
          unit_price: unitPrice,
          compare_at_price: Math.max(compareAtPrice, unitPrice),
          gst_slab_id: slabId,
          hsn_sac_code: hsn || "4901",
          sort_order: Number(
            comp.sortOrder !== undefined
              ? comp.sortOrder
              : comp.sort_order !== undefined
              ? comp.sort_order
              : index
          ),
          is_active:
            comp.isActive !== undefined
              ? Boolean(comp.isActive)
              : comp.is_active !== undefined
              ? Boolean(comp.is_active)
              : true,
        };
      });

      const insertedRows = await executeSupabaseQuery(
        "variant_components",
        "insert",
        {
          data: rowsToInsert,
          select: "*, gst_slabs(id, rate_percentage, hsn_sac_code, description)",
        }
      );

      return insertedRows || [];
    } catch (error) {
      logger.error(
        "Error in variantComponentRepository.replaceComponentsForVariant:",
        {
          parentVariantId,
          componentsCount: components?.length,
          error: error.message,
        }
      );
      throw error;
    }
  }

  /**
   * Deletes all components for the variant.
   * @param {string} parentVariantId - UUID of parent product variant.
   * @returns {Promise<boolean>} True if deletion succeeded.
   */
  async deleteByParentVariantId(parentVariantId) {
    try {
      await executeSupabaseQuery("variant_components", "delete", {
        eq: { parent_variant_id: parentVariantId },
      });

      return true;
    } catch (error) {
      logger.error(
        "Error in variantComponentRepository.deleteByParentVariantId:",
        {
          parentVariantId,
          error: error.message,
        }
      );
      throw error;
    }
  }
}

export const variantComponentRepository = new VariantComponentRepository();
export default variantComponentRepository;
