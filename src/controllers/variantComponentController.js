import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { variantComponentService as defaultVariantCompSvc } from "../services/variantComponentService.js";
import { logger } from "../utils/logger.js";

/**
 * Variant Component Controller
 * Handles HTTP requests for configuring loose kit items, bottom-up pricing rollups,
 * and reverting back to flat-rate GST variants.
 */
export class VariantComponentController {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.variantComponentService]
   */
  constructor(deps = {}) {
    this.variantComponentService =
      deps.variantComponentService || defaultVariantCompSvc;
  }

  /**
   * PUT /api/v1/products/:productId/variants/:variantId/components
   * Configure loose kit components for a variant.
   */
  setComponents = asyncHandler(async (req, res) => {
    const { productId, variantId } = req.params;
    const components = Array.isArray(req.body)
      ? req.body
      : req.body.components || [];

    if (!components || components.length === 0) {
      throw new AppError("At least one component item is required", 400);
    }

    // Retailer id from authenticated user; Admins bypass ownership or can configure for any
    const retailerId = req.user?.role === "admin" ? null : req.user?.id;

    const result = await this.variantComponentService.configureComponents(
      productId,
      variantId,
      retailerId,
      components
    );

    return res.status(200).json({
      success: true,
      message: "Kit components configured successfully",
      data: result,
    });
  });

  /**
   * POST /api/v1/products/:productId/variants/:variantId/revert-flat
   * Revert a split-GST variant back to a flat GST slab.
   */
  revertToFlatGst = asyncHandler(async (req, res) => {
    const { productId, variantId } = req.params;
    const { gstSlabId, price, compareAtPrice } = req.body;
    const retailerId = req.user?.role === "admin" ? null : req.user?.id;

    const result = await this.variantComponentService.revertToFlatGst(
      productId,
      variantId,
      retailerId,
      { gstSlabId, price, compareAtPrice }
    );

    return res.status(200).json({
      success: true,
      message: "Variant reverted to flat GST successfully",
      data: result,
    });
  });

  /**
   * GET /api/v1/variants/:variantId/components
   * Retrieve active loose components for a variant.
   */
  getComponents = asyncHandler(async (req, res) => {
    const { variantId } = req.params;

    const data = await this.variantComponentService.getComponents(variantId);

    return res.status(200).json({
      success: true,
      data: data || [],
    });
  });
}

/**
 * Controller factory function
 * @param {Object} [deps]
 * @returns {VariantComponentController}
 */
export function createVariantComponentController(deps = {}) {
  return new VariantComponentController(deps);
}

export const variantComponentController = new VariantComponentController();
export default createVariantComponentController;
