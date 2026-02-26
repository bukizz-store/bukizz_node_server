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
     * GET /summary
     * Fetch settlement dashboard summary. Retailers are scoped to their own data via warehouseId.
     */
    getSummary: asyncHandler(async (req, res) => {
      const warehouseId = req.headers["x-warehouse-id"];
      let retailerId = req.query.retailerId; // Admin can specify

      if (req.user.roles?.includes("retailer")) {
        retailerId = req.user.id;
      }

      if (!retailerId || !warehouseId) {
        return res
          .status(400)
          .json({ success: false, error: "Missing retailerId or warehouseId" });
      }

      const result = await settlementService.getDashboardSummary(
        retailerId,
        warehouseId,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    }),

    /**
     * GET /ledgers
     * Fetch ledger history. Retailers are scoped to their own data.
     */
    getLedgers: asyncHandler(async (req, res) => {
      const filters = { ...req.query };
      filters.warehouseId = req.headers["x-warehouse-id"];

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
      filters.warehouseId = req.headers["x-warehouse-id"];

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

    // ── Admin-only endpoints ──────────────────────────────────────────────

    /**
     * GET /admin/retailers/:retailerId/summary
     * Admin-only: full financial summary for a retailer.
     */
    getAdminRetailerSummary: asyncHandler(async (req, res) => {
      const { retailerId } = req.params;

      const result =
        await settlementService.getAdminRetailerSummary(retailerId);

      res.status(200).json({
        success: true,
        data: result,
      });
    }),

    /**
     * GET /admin/retailers/:retailerId/ledgers/unsettled
     * Admin-only: all unsettled ledger rows for a retailer (FIFO order).
     */
    getAdminUnsettledLedgers: asyncHandler(async (req, res) => {
      const { retailerId } = req.params;

      const data = await settlementService.getAdminUnsettledLedgers(retailerId);

      res.status(200).json({
        success: true,
        data,
      });
    }),

    /**
     * GET /admin/retailers/:retailerId/history
     * Admin-only: full payout history for a retailer (newest first).
     */
    getAdminSettlementHistory: asyncHandler(async (req, res) => {
      const { retailerId } = req.params;

      const data =
        await settlementService.getAdminSettlementHistory(retailerId);

      res.status(200).json({
        success: true,
        data,
      });
    }),

    /**
     * POST /admin/execute
     * Admin-only: execute a FIFO payout. Reuses the same service logic
     * as the existing executeSettlement handler but exposed on the
     * admin sub-router.
     */
    executeAdminFifoPayout: asyncHandler(async (req, res) => {
      const result = await settlementService.executeSettlement({
        ...req.body,
        adminId: req.user.id,
      });

      logger.info("Admin FIFO payout executed", {
        adminId: req.user.id,
        settlementId: result.settlementId,
        retailerId: req.body.retailerId,
        amount: req.body.amount,
        paymentMode: req.body.paymentMode,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: "FIFO payout executed successfully",
      });
    }),

    // ── Retailer-only endpoints ───────────────────────────────────────────

    /**
     * GET /retailer/ledgers
     * Retailer: dashboard ledgers (all or unsettled).
     */
    getRetailerLedgers: asyncHandler(async (req, res) => {
      const warehouseId = req.headers["x-warehouse-id"];
      const retailerId = req.user.id;

      const result = await settlementService.getRetailerLedgers(
        retailerId,
        warehouseId,
        req.query,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    }),

    /**
     * GET /retailer/history
     * Retailer: payout history list.
     */
    getRetailerSettlementHistory: asyncHandler(async (req, res) => {
      const retailerId = req.user.id;

      const data =
        await settlementService.getRetailerSettlementHistory(retailerId);

      res.status(200).json({
        success: true,
        data,
      });
    }),

    /**
     * GET /retailer/history/:settlementId
     * Retailer: detailed drill-down of a single settlement.
     */
    getRetailerSettlementDetails: asyncHandler(async (req, res) => {
      const { settlementId } = req.params;
      const retailerId = req.user.id;

      const data = await settlementService.getRetailerSettlementDetails(
        settlementId,
        retailerId,
      );

      res.status(200).json({
        success: true,
        data,
      });
    }),
  };
}
