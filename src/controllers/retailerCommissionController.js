import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { retailerCommissionRepository as defaultRetailerCommissionRepo } from "../repositories/retailerCommissionRepository.js";
import { logger } from "../utils/logger.js";

/**
 * Retailer Commission Controller
 * Handles configuration and retrieval of vendor-specific commission rules.
 */
export class RetailerCommissionController {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.retailerCommissionRepository]
   */
  constructor(deps = {}) {
    this.retailerCommissionRepository =
      deps.retailerCommissionRepository || defaultRetailerCommissionRepo;
  }

  /**
   * GET /api/v1/retailer-commissions/:retailerId
   * Retrieve all commission rules for a retailer.
   * Retailer role is scoped to their own retailerId; Admins can query any retailer.
   */
  getRetailerCommissions = asyncHandler(async (req, res) => {
    let { retailerId } = req.params;

    if (retailerId === "me") {
      retailerId = req.user?.id;
      if (!retailerId) {
        throw new AppError("Authentication required", 401);
      }
    }

    // Authorization check: retailers can only inspect their own commission structure
    const isRetailerOnly =
      req.user?.role === "retailer" ||
      (req.user?.roles?.includes("retailer") && !req.user?.roles?.includes("admin"));

    if (isRetailerOnly && req.user.id !== retailerId) {
      throw new AppError("Access denied: You can only view your own commission rules", 403);
    }

    const data = await this.retailerCommissionRepository.getByRetailerId(retailerId);

    return res.status(200).json({
      success: true,
      data,
    });
  });

  /**
   * POST /api/v1/retailer-commissions
   * Create or update a commission rule for a retailer.
   */
  setCommission = asyncHandler(async (req, res) => {
    const data = await this.retailerCommissionRepository.upsertCommission(req.body);

    return res.status(200).json({
      success: true,
      message: "Retailer commission rule saved successfully",
      data,
    });
  });

  /**
   * DELETE /api/v1/retailer-commissions/:id
   * Delete a commission rule by ID.
   */
  deleteCommission = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await this.retailerCommissionRepository.deleteCommission(id);

    return res.status(200).json({
      success: true,
      message: "Retailer commission rule deleted successfully",
      data: null,
    });
  });
}

/**
 * Controller factory function
 * @param {Object} [deps]
 * @returns {RetailerCommissionController}
 */
export function createRetailerCommissionController(deps = {}) {
  return new RetailerCommissionController(deps);
}

export default createRetailerCommissionController;
