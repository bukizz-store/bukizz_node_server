import express from "express";
import {
  authenticateToken,
  requireRoles,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { settlementSchemas } from "../models/schemas.js";

/**
 * Settlement Routes Factory
 * @param {Object} controller - settlementController instance from DI.
 * @returns {Router} Express router with settlement routes.
 */
export default function settlementRoutes(controller) {
  const router = express.Router();

  // All settlement routes require authentication
  router.use(authenticateToken);

  // ── Ledger History (admin + retailer) ────────────────────────────────
  router.get(
    "/ledgers",
    requireRoles("admin", "retailer"),
    validate(settlementSchemas.ledgerQuery, "query"),
    controller.getLedgers,
  );

  // ── Settlement / Payout History (admin + retailer) ───────────────────
  router.get(
    "/",
    requireRoles("admin", "retailer"),
    validate(settlementSchemas.settlementQuery, "query"),
    controller.getSettlements,
  );

  // ── Manual Adjustment (admin only) ───────────────────────────────────
  router.post(
    "/adjustments",
    requireRoles("admin"),
    validate(settlementSchemas.manualAdjustment),
    controller.addManualAdjustment,
  );

  // ── Execute FIFO Settlement (admin only) ─────────────────────────────
  router.post(
    "/execute",
    requireRoles("admin"),
    validate(settlementSchemas.settlementExecution),
    controller.executeSettlement,
  );

  return router;
}
