import express from "express";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { paramSchemas, dpAdminSchemas } from "../models/schemas.js";

/**
 * DP Admin Routes Factory
 * All routes require admin authentication and specific RBAC permissions.
 *
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function dpAdminRoutes(dependencies = {}) {
  const router = express.Router();
  const { dpAdminCtrl, accessService } = dependencies;

  if (!dpAdminCtrl) {
    console.error("dpAdminCtrl not found in dependencies");
    return router;
  }

  // All routes require authentication
  router.use(authenticateToken);

  // GET / — List all delivery partners (Hub List)
  router.get(
    "/",
    requirePermissions(accessService, "delivery_partners:read"),
    validate(dpAdminSchemas.dpListQuery, "query"),
    dpAdminCtrl.getHubList,
  );

  // GET /cash/remittances — List all cash remittances from DPs (MUST be defined before /:id)
  router.get(
    "/cash/remittances",
    requirePermissions(accessService, "approvals:cash_remittances:read"),
    dpAdminCtrl.listCashRemittances,
  );

  // POST /cash/remittances/:id/approve — Approve a cash remittance
  router.post(
    "/cash/remittances/:id/approve",
    requirePermissions(accessService, "approvals:cash_remittances:manage"),
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.approveCashRemittance,
  );

  // GET /:id — Get comprehensive DP details
  router.get(
    "/:id",
    requirePermissions(accessService, "delivery_partners:read"),
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.getDpDetails,
  );

  // GET /:id/active-loadout — Get active orders with SLA timer
  router.get(
    "/:id/active-loadout",
    requirePermissions(accessService, "delivery_partners:read"),
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.getActiveLoadout,
  );

  // POST /:id/unassign — Force-unassign an order from a DP
  router.post(
    "/:id/unassign",
    requirePermissions(accessService, "delivery_partners:manage"),
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.forceUnassign),
    dpAdminCtrl.forceUnassignOrder,
  );

  // GET /:id/ledger — Get ledger transactions with running balance
  router.get(
    "/:id/ledger",
    requirePermissions(accessService, "delivery_partners:ledger:read"),
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.paginationQuery, "query"),
    dpAdminCtrl.getLedgerAndSettlements,
  );

  // GET /:id/history — Get delivery history
  router.get(
    "/:id/history",
    requirePermissions(accessService, "delivery_partners:read"),
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.paginationQuery, "query"),
    dpAdminCtrl.getDeliveryHistory,
  );

  // POST /:id/payout — Initiate payout
  router.post(
    "/:id/payout",
    requirePermissions(accessService, "delivery_partners:ledger:manage"),
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.initiatePayoutBody),
    dpAdminCtrl.initiatePayout,
  );

  // PATCH /:id/cod-status — Update COD Eligibility
  router.patch(
    "/:id/cod-status",
    requirePermissions(accessService, "delivery_partners:manage"),
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.updateCodEligibility,
  );

  return router;
}
