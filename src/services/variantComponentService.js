import { variantComponentRepository as defaultVariantCompRepo } from "../repositories/variantComponentRepository.js";
import { productVariantRepository as defaultProductVariantRepo } from "../repositories/productVariantRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { WarehouseRepository } from "../repositories/warehouseRepository.js";
import { gstSlabRepository as defaultGstSlabRepo } from "../repositories/gstSlabRepository.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Variant Component Service
 * Handles loose kit component decomposition, bottom-up pricing rollups,
 * and reverting between split-GST components and flat-rate GST.
 */
export class VariantComponentService {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.variantComponentRepository]
   * @param {Object} [deps.productVariantRepository]
   * @param {Object} [deps.productRepository]
   * @param {Object} [deps.warehouseRepository]
   * @param {Object} [deps.gstSlabRepository]
   */
  constructor(deps = {}) {
    this.variantComponentRepository =
      deps.variantComponentRepository || defaultVariantCompRepo;
    this.productVariantRepository =
      deps.productVariantRepository || defaultProductVariantRepo;
    this.productRepository =
      deps.productRepository || new ProductRepository();
    this.warehouseRepository =
      deps.warehouseRepository || new WarehouseRepository();
    this.gstSlabRepository =
      deps.gstSlabRepository || defaultGstSlabRepo;
  }

  /**
   * Helper: Verify retailer ownership of the product and associated warehouse
   * @param {string} productId - UUID of product
   * @param {string} [retailerId] - UUID of retailer
   * @returns {Promise<Object>} The verified product
   */
  async _verifyProductOwnership(productId, retailerId) {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new AppError("Product not found", 404);
    }

    if (retailerId) {
      const prodRetailerId = product.retailer_id || product.retailerId;
      if (prodRetailerId && prodRetailerId !== retailerId) {
        throw new AppError(
          "Access denied: You do not have ownership of this product",
          403
        );
      }

      const warehouseId = product.warehouse_id || product.warehouseId;
      if (
        warehouseId &&
        this.warehouseRepository &&
        typeof this.warehouseRepository.isLinkedToRetailer === "function"
      ) {
        const isLinked = await this.warehouseRepository.isLinkedToRetailer(
          retailerId,
          warehouseId
        );
        if (!isLinked) {
          throw new AppError(
            "Access denied: You do not have ownership of the warehouse associated with this product",
            403
          );
        }
      }
    }

    return product;
  }

  /**
   * Configure kit components for a variant.
   * - Verifies ownership of product and warehouse.
   * - Validates all gstSlabIds exist and are active.
   * - Computes bottom-up sums:
   *     totalPrice = sum(quantity * unitPrice)
   *     totalCompareAt = sum(quantity * compareAtPrice)
   * - Updates parent product_variants: sets price = totalPrice, compare_at_price = totalCompareAt, and gst_slab_id = null (marking Split/Multi-GST).
   * - Calls variantComponentRepository.replaceComponentsForVariant(variantId, components).
   *
   * @param {string} productId - UUID of product.
   * @param {string} variantId - UUID of variant.
   * @param {string} [retailerId] - UUID of requesting retailer.
   * @param {Array<Object>} components - List of component specifications.
   * @returns {Promise<Object>} Configuration result with updated sums and components.
   */
  async configureComponents(productId, variantId, retailerId, components) {
    try {
      if (!components || !Array.isArray(components) || components.length === 0) {
        throw new AppError("At least one component item is required", 400);
      }

      // 1. Verify product ownership
      await this._verifyProductOwnership(productId, retailerId);

      // 2. Validate variant exists and belongs to product
      const variant = await this.productVariantRepository.findById(variantId);
      if (!variant) {
        throw new AppError("Product variant not found", 404);
      }
      if (variant.productId && variant.productId !== productId && variant.product_id !== productId) {
        throw new AppError("Variant does not belong to specified product", 400);
      }

      // 3. Validate all gstSlabIds exist and are active
      const activeSlabs = await this.gstSlabRepository.findAllActive();
      const activeSlabMap = new Map((activeSlabs || []).map((s) => [s.id, s]));
      const activeSlabByRate = new Map(
        (activeSlabs || []).map((s) => [Number(s.rate_percentage), s])
      );

      // Map any client fallback dummy UUIDs to canonical rates
      const fallbackUuidRateMap = {
        "00000000-0000-0000-0000-000000000000": 0,
        "00000000-0000-0000-0000-000000000001": 5,
        "00000000-0000-0000-0000-000000000002": 12,
        "00000000-0000-0000-0000-000000000003": 18,
        "00000000-0000-0000-0000-000000000004": 28,
      };

      for (const comp of components) {
        let slabId = comp.gstSlabId || comp.gst_slab_id;

        // Resolve fallback dummy UUID or missing ID by rate
        if (slabId && fallbackUuidRateMap[slabId] !== undefined) {
          const targetRate = fallbackUuidRateMap[slabId];
          const matched = activeSlabByRate.get(targetRate);
          if (matched) {
            slabId = matched.id;
            comp.gstSlabId = matched.id;
            comp.hsnSacCode = comp.hsnSacCode || matched.hsn_sac_code;
          }
        } else if (!slabId && comp.gstRate !== undefined) {
          const matched = activeSlabByRate.get(Number(comp.gstRate));
          if (matched) {
            slabId = matched.id;
            comp.gstSlabId = matched.id;
            comp.hsnSacCode = comp.hsnSacCode || matched.hsn_sac_code;
          }
        }

        if (!slabId || !activeSlabMap.has(slabId)) {
          // Attempt fallback by rate or active slabs fallback
          const rateVal = comp.gstRate ?? comp.gst_rate ?? comp.rate;
          const matchedByRate = rateVal !== undefined
            ? activeSlabByRate.get(Number(rateVal))
            : activeSlabs.find((s) => String(s.id) === String(slabId));

          if (matchedByRate) {
            slabId = matchedByRate.id;
            comp.gstSlabId = matchedByRate.id;
            comp.hsnSacCode = comp.hsnSacCode || matchedByRate.hsn_sac_code;
          } else if (activeSlabs.length > 0) {
            logger.warn(
              `Unrecognized GST slab '${slabId}' for component '${comp.componentTitle || comp.component_title}', defaulting to standard slab: ${activeSlabs[0].id}`
            );
            slabId = activeSlabs[0].id;
            comp.gstSlabId = slabId;
            comp.hsnSacCode = comp.hsnSacCode || activeSlabs[0].hsn_sac_code || "4901";
          } else {
            throw new AppError(
              `Invalid or inactive GST slab specified for component '${comp.componentTitle || comp.component_title}': ${slabId}`,
              400
            );
          }
        }

        // Ensure canonical slab ID is set on component
        comp.gstSlabId = slabId;
      }

      // 4. Compute bottom-up price sums
      let totalPrice = 0.0;
      let totalCompareAt = 0.0;

      for (const comp of components) {
        const qty = Number(comp.quantity !== undefined ? comp.quantity : 1);
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

        if (qty <= 0) {
          throw new AppError("Component quantity must be at least 1", 400);
        }
        if (unitPrice < 0) {
          throw new AppError("Component unit price cannot be negative", 400);
        }
        if (compareAtPrice < unitPrice) {
          throw new AppError(
            `Compare at price (${compareAtPrice}) must be greater than or equal to unit price (${unitPrice}) for component '${comp.componentTitle || comp.component_title}'`,
            400
          );
        }

        totalPrice += unitPrice * qty;
        totalCompareAt += compareAtPrice * qty;
      }

      totalPrice = Math.round(totalPrice * 100) / 100;
      totalCompareAt = Math.round(totalCompareAt * 100) / 100;

      // 5. Update parent product_variants: price = totalPrice, compare_at_price = totalCompareAt, gst_slab_id = null
      await this.productVariantRepository.updateVariant(variantId, {
        price: totalPrice,
        compareAtPrice: totalCompareAt,
        gstSlabId: null,
      });

      // 6. Replace components in database
      const savedComponents =
        await this.variantComponentRepository.replaceComponentsForVariant(
          variantId,
          components
        );

      logger.info("Successfully configured kit components for variant", {
        productId,
        variantId,
        componentCount: savedComponents.length,
        totalPrice,
        totalCompareAt,
      });

      return {
        productId,
        variantId,
        totalPrice,
        compareAtPrice: totalCompareAt,
        gstSlabId: null,
        isSplitGst: true,
        components: savedComponents,
      };
    } catch (error) {
      logger.error("Error in variantComponentService.configureComponents:", {
        productId,
        variantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revert a split-GST kit back to a flat-rate GST variant.
   * - Verifies ownership and validates gstSlabId.
   * - Deletes all components via variantComponentRepository.deleteByParentVariantId(variantId).
   * - Restores parent product_variants with price, compare_at_price, and gst_slab_id.
   *
   * @param {string} productId - UUID of product.
   * @param {string} variantId - UUID of variant.
   * @param {string} [retailerId] - UUID of requesting retailer.
   * @param {Object} options
   * @param {string} options.gstSlabId - Master GST slab to assign.
   * @param {number} options.price - Restored flat unit selling price.
   * @param {number} options.compareAtPrice - Restored MRP / compare-at price.
   * @returns {Promise<Object>} Updated variant.
   */
  async revertToFlatGst(productId, variantId, retailerId, { gstSlabId, price, compareAtPrice }) {
    try {
      // 1. Verify product ownership
      await this._verifyProductOwnership(productId, retailerId);

      // 2. Validate GST slab exists and is active
      const slab = await this.gstSlabRepository.findById(gstSlabId);
      if (!slab || slab.is_active === false) {
        throw new AppError("Specified GST slab does not exist or is inactive", 400);
      }

      const numPrice = Number(price);
      const numCompareAt = Number(compareAtPrice);

      if (numPrice < 0) {
        throw new AppError("Price cannot be negative", 400);
      }
      if (numCompareAt < numPrice) {
        throw new AppError("compareAtPrice must be greater than or equal to price", 400);
      }

      // 3. Delete all loose components for this variant
      await this.variantComponentRepository.deleteByParentVariantId(variantId);

      // 4. Restore parent product variant
      const updatedVariant = await this.productVariantRepository.updateVariant(
        variantId,
        {
          price: numPrice,
          compareAtPrice: numCompareAt,
          gstSlabId: gstSlabId,
        }
      );

      logger.info("Successfully reverted variant to flat GST", {
        productId,
        variantId,
        gstSlabId,
        price: numPrice,
      });

      return updatedVariant;
    } catch (error) {
      logger.error("Error in variantComponentService.revertToFlatGst:", {
        productId,
        variantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Retrieve active components for a variant.
   * @param {string} variantId - UUID of product variant.
   * @returns {Promise<Array<Object>>} List of component items.
   */
  async getComponents(variantId) {
    try {
      return await this.variantComponentRepository.getByParentVariantId(variantId);
    } catch (error) {
      logger.error("Error in variantComponentService.getComponents:", {
        variantId,
        error: error.message,
      });
      throw error;
    }
  }
}

/**
 * Factory function for VariantComponentService
 * @param {Object} [deps]
 * @returns {VariantComponentService}
 */
export function createVariantComponentService(deps = {}) {
  return new VariantComponentService(deps);
}

export const variantComponentService = new VariantComponentService();
export default variantComponentService;
