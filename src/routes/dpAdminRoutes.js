import express from "express";
import {
  authenticateToken,
  requireRoles,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { paramSchemas, dpAdminSchemas } from "../models/schemas.js";

/**
 * DP Admin Routes Factory
 * All routes require admin authentication.
 *
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function dpAdminRoutes(dependencies = {}) {
  const router = express.Router();
  const { dpAdminCtrl } = dependencies;

  if (!dpAdminCtrl) {
    console.error("dpAdminCtrl not found in dependencies");
    return router;
  }

  // All routes require admin authentication
  router.use(authenticateToken, requireRoles("admin"));

  // GET / — List all delivery partners (Hub List)
  router.get(
    "/",
    validate(dpAdminSchemas.dpListQuery, "query"),
    dpAdminCtrl.getHubList,
  );

  // GET /:id — Get comprehensive DP details
  router.get(
    "/:id",
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.getDpDetails,
  );

  // GET /:id/active-loadout — Get active orders with SLA timer
  router.get(
    "/:id/active-loadout",
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.getActiveLoadout,
  );

  // POST /:id/unassign — Force-unassign an order from a DP
  router.post(
    "/:id/unassign",
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.forceUnassign),
    dpAdminCtrl.forceUnassignOrder,
  );

  // GET /:id/ledger — Get ledger transactions with running balance
  router.get(
    "/:id/ledger",
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.paginationQuery, "query"),
    dpAdminCtrl.getLedgerAndSettlements,
  );

  // GET /:id/history — Get delivery history
  router.get(
    "/:id/history",
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.paginationQuery, "query"),
    dpAdminCtrl.getDeliveryHistory,
  );

  // POST /:id/payout — Initiate payout
  router.post(
    "/:id/payout",
    validate(paramSchemas.id, "params"),
    validate(dpAdminSchemas.initiatePayoutBody),
    dpAdminCtrl.initiatePayout,
  );

  // PATCH /:id/cod-status — Update COD Eligibility
  router.patch(
    "/:id/cod-status",
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.updateCodEligibility,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Cash Collection Admin Routes
  // ═══════════════════════════════════════════════════════════════════════

  // GET /cash/remittances — List all cash remittances from DPs
  router.get(
    "/cash/remittances",
    dpAdminCtrl.listCashRemittances,
  );

  // POST /cash/remittances/:id/approve — Approve a cash remittance
  router.post(
    "/cash/remittances/:id/approve",
    validate(paramSchemas.id, "params"),
    dpAdminCtrl.approveCashRemittance,
  );

  return router;
}
