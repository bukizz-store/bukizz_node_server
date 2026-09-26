import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { closingFeeRepository as defaultClosingFeeRepo } from "../repositories/closingFeeRepository.js";
import { logger } from "../utils/logger.js";

/**
 * Closing Fee Controller
 * Handles administrative management of tiered closing fee slabs.
 */
export class ClosingFeeController {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.closingFeeRepository]
   */
  constructor(deps = {}) {
    this.closingFeeRepository =
      deps.closingFeeRepository || defaultClosingFeeRepo;
  }

  /**
   * GET /api/v1/closing-fees
   * Retrieve all active closing fee slabs sorted by min_price ascending.
   */
  getSlabs = asyncHandler(async (req, res) => {
    const data = await this.closingFeeRepository.getAllActive();

    return res.status(200).json({
      success: true,
      data,
    });
  });

  /**
   * POST /api/v1/closing-fees
   * Create a new closing fee slab tier.
   */
  createSlab = asyncHandler(async (req, res) => {
    const data = await this.closingFeeRepository.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Closing fee slab created successfully",
      data,
    });
  });

  /**
   * PUT /api/v1/closing-fees/:id
   * Update an existing closing fee slab tier.
   */
  updateSlab = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await this.closingFeeRepository.update(id, req.body);

    if (!data) {
      throw new AppError("Closing fee slab not found", 404);
    }

    return res.status(200).json({
      success: true,
      message: "Closing fee slab updated successfully",
      data,
    });
  });

  /**
   * DELETE /api/v1/closing-fees/:id
   * Remove a closing fee slab tier.
   */
  deleteSlab = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await this.closingFeeRepository.delete(id);

    return res.status(200).json({
      success: true,
      message: "Closing fee slab deleted successfully",
      data: null,
    });
  });
}

/**
 * Controller factory function
 * @param {Object} [deps]
 * @returns {ClosingFeeController}
 */
export function createClosingFeeController(deps = {}) {
  return new ClosingFeeController(deps);
}

export default createClosingFeeController;
