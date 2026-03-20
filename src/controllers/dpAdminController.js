import { asyncHandler } from "../middleware/errorHandler.js";

/**
 * DP Admin Controller Factory
 * Returns asyncHandler-wrapped route handlers for admin DP management.
 *
 * @param {Object} deps
 * @param {Object} deps.dpAdminService - Injected dpAdminService instance.
 * @returns {Object} Controller methods
 */
export function dpAdminController({ dpAdminService }) {
  return {
    /**
     * GET /
     * List all delivery partners with wallet balance and active order counts.
     */
    getHubList: asyncHandler(async (req, res) => {
      const result = await dpAdminService.getHubList(req.query);

      res.status(200).json({
        status: "success",
        data: result,
      });
    }),

    /**
     * GET /:id
     * Get comprehensive details for a single delivery partner.
     */
    getDpDetails: asyncHandler(async (req, res) => {
      const { id } = req.params;
      const result = await dpAdminService.getDpDetails(id);

      res.status(200).json({
        status: "success",
        data: result,
      });
    }),

    /**
     * GET /:id/active-loadout
     * Get active orders assigned to a DP with SLA timer.
     */
    getActiveLoadout: asyncHandler(async (req, res) => {
      const { id } = req.params;
      const result = await dpAdminService.getActiveLoadoutWithSLA(id);

      res.status(200).json({
        status: "success",
        data: result,
      });
    }),

    /**
     * POST /:id/unassign
     * Force-unassign an order from a delivery partner.
     */
    forceUnassignOrder: asyncHandler(async (req, res) => {
      const { id } = req.params;
      const adminId = req.user.id;
      const result = await dpAdminService.forceUnassignOrder(
        id,
        req.body,
        adminId,
      );

      res.status(200).json({
        status: "success",
        data: result,
      });
    }),

    /**
     * GET /:id/ledger
     * Get ledger transactions with running balance for a DP.
     */
    getLedgerAndSettlements: asyncHandler(async (req, res) => {
      const { id } = req.params;
      const result = await dpAdminService.getLedgerAndSettlements(id, req.query);

      res.status(200).json({
        status: "success",
        data: result,
      });
    }),

    /**
     * GET /:id/history
     * Get delivery history for a DP (paginated).
     */
    getDeliveryHistory: asyncHandler(async (req, res) => {
      const { id } = req.params;
      const result = await dpAdminService.getDeliveryHistory(id, req.query);

      res.status(200).json({
        status: "success",
        data: result,
      });
    }),

    /**
     * POST /:id/payout
     * Initiate a ledger payout for a DP.
     */
    initiatePayout: asyncHandler(async (req, res) => {
      const { id } = req.params;
      const adminId = req.user.id;
      const result = await dpAdminService.initiatePayout(id, req.body, adminId);

      res.status(200).json({
        status: "success",
        data: result.transaction,
        message: result.message,
      });
    }),

    /**
     * PATCH /:id/cod-status
     * Update COD eligibility for a DP.
     */
    updateCodEligibility: asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { isCodEligible } = req.body;
      const result = await dpAdminService.updateCodEligibility(id, isCodEligible);

      res.status(200).json({
        status: "success",
        data: result,
        message: "COD eligibility updated successfully",
      });
    }),
  };
}
