import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { feeConfigRepository as defaultFeeConfigRepo } from "../repositories/feeConfigRepository.js";
import { gstSlabRepository as defaultGstSlabRepo } from "../repositories/gstSlabRepository.js";
import { taxFeeService as defaultTaxFeeSvc } from "../services/taxFeeService.js";
import { logger } from "../utils/logger.js";

/**
 * Fee Configuration & GST Slab Controller
 * Handles HTTP requests for tax slabs, platform fees, and live cart financial previews.
 */
export class FeeConfigController {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.feeConfigRepository]
   * @param {Object} [deps.gstSlabRepository]
   * @param {Object} [deps.taxFeeService]
   */
  constructor(deps = {}) {
    this.feeConfigRepository =
      deps.feeConfigRepository || defaultFeeConfigRepo;
    this.gstSlabRepository =
      deps.gstSlabRepository || defaultGstSlabRepo;
    this.taxFeeService =
      deps.taxFeeService || defaultTaxFeeSvc;
  }

  /**
   * GET /api/v1/fee-config/gst-slabs
   * Fetch all active GST slabs.
   */
  getGstSlabs = asyncHandler(async (req, res) => {
    const data = await this.gstSlabRepository.findAllActive();

    return res.status(200).json({
      success: true,
      data,
    });
  });

  /**
   * POST /api/v1/fee-config/gst-slabs
   * Create a new GST slab.
   */
  createGstSlab = asyncHandler(async (req, res) => {
    const data = await this.gstSlabRepository.create(req.body);

    return res.status(201).json({
      success: true,
      message: "GST slab created successfully",
      data,
    });
  });

  /**
   * PUT /api/v1/fee-config/gst-slabs/:id
   * Update an existing GST slab by ID.
   */
  updateGstSlab = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await this.gstSlabRepository.update(id, req.body);

    if (!data) {
      throw new AppError("GST slab not found", 404);
    }

    return res.status(200).json({
      success: true,
      message: "GST slab updated successfully",
      data,
    });
  });

  /**
   * GET /api/v1/fee-config/fees
   * Fetch all dynamic system fee configurations.
   */
  getFeeConfigurations = asyncHandler(async (req, res) => {
    const data = await this.feeConfigRepository.getAll();

    return res.status(200).json({
      success: true,
      data,
    });
  });

  /**
   * PUT /api/v1/fee-config/fees/:configKey
   * Update a system fee configuration by its unique configKey.
   */
  updateFeeConfiguration = asyncHandler(async (req, res) => {
    const { configKey } = req.params;
    const userId = req.user?.id || null;

    const data = await this.feeConfigRepository.updateConfig(
      configKey,
      req.body,
      userId
    );

    if (!data) {
      throw new AppError("Fee configuration not found", 404);
    }

    return res.status(200).json({
      success: true,
      message: "Fee configuration updated successfully",
      data,
    });
  });

  /**
   * POST /api/v1/fee-config/cart/preview
   * Live preview and bifurcation of order taxes, platform fees, and line item breakdowns.
   */
  previewCartCalculation = asyncHandler(async (req, res) => {
    const { items, shippingAddress } = req.body;
    const customerState = shippingAddress?.state || "Delhi";

    const calculation = await this.taxFeeService.evaluateOrderFinancials(
      items,
      customerState
    );

    return res.status(200).json({
      success: true,
      data: calculation,
    });
  });
}

/**
 * Controller factory function
 * @param {Object} [deps]
 * @returns {FeeConfigController}
 */
export function createFeeConfigController(deps = {}) {
  return new FeeConfigController(deps);
}

export default createFeeConfigController;
