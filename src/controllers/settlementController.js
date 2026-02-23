import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Settlement Controller Factory
 * Returns an object of asyncHandler-wrapped route handlers.
 *
 * @param {Object} deps
 * @param {Object} deps.settlementService - Injected SettlementService instance.
 * @returns {Object} Controller methods.
 */
export function settlementController({ settlementService }) {
  return {
    /**
     * GET /ledgers
     * Fetch ledger history. Retailers are scoped to their own data.
     */
    getLedgers: asyncHandler(async (req, res) => {
      const filters = { ...req.query };

      // Security: retailers can only view their own ledger
      if (req.user.roles?.includes("retailer")) {
        filters.retailerId = req.user.id;
      }

      const result = await settlementService.getLedgerHistory(filters);

      res.status(200).json({
        success: true,
        data: result,
      });
    }),

    /**
     * GET /
     * Fetch settlement (payout) history. Retailers are scoped to their own data.
     */
    getSettlements: asyncHandler(async (req, res) => {
      const filters = { ...req.query };

      // Security: retailers can only view their own settlements
      if (req.user.roles?.includes("retailer")) {
        filters.retailerId = req.user.id;
      }

      const result = await settlementService.getSettlements(filters);

      res.status(200).json({
        success: true,
        data: result,
      });
    }),

    /**
     * POST /adjustments
     * Admin-only: record a manual credit or debit on a retailer's ledger.
     */
    addManualAdjustment: asyncHandler(async (req, res) => {
      const result = await settlementService.createManualAdjustment({
        ...req.body,
        adminId: req.user.id,
      });

      logger.info("Manual adjustment created by admin", {
        adminId: req.user.id,
        retailerId: req.body.retailerId,
        amount: req.body.amount,
        entryType: req.body.entryType,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: "Manual adjustment recorded successfully",
      });
    }),

    /**
     * POST /execute
     * Admin-only: execute a FIFO settlement payout for a retailer.
     */
    executeSettlement: asyncHandler(async (req, res) => {
      const result = await settlementService.executeSettlement({
        ...req.body,
        adminId: req.user.id,
      });

      logger.info("Settlement executed by admin", {
        adminId: req.user.id,
        settlementId: result.settlementId,
        retailerId: req.body.retailerId,
        amount: req.body.amount,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: "Settlement executed successfully",
      });
    }),
  };
}
