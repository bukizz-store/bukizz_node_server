import express from "express";
import {
  authenticateToken,
  requireRoles,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { settlementSchemas } from "../models/schemas.js";
import Joi from "joi";

/**
 * Settlement Routes Factory
 * @param {Object} controller - settlementController instance from DI.
 * @returns {Router} Express router with settlement routes.
 */
export default function settlementRoutes(controller) {
  const router = express.Router();

  // All settlement routes require authentication
  router.use(authenticateToken);

  // ── Header Validation for Retailers ──────────────────────────────────
  const warehouseHeaderSchema = Joi.object({
    "x-warehouse-id": Joi.string().uuid().required(),
  }).unknown(true);

  // ── Dashboard Summary ────────────────────────────────────────────────
  router.get(
    "/summary",
    requireRoles("admin", "retailer"),
    validate(warehouseHeaderSchema, "headers"),
    controller.getSummary,
  );

  // ── Ledger History (admin + retailer) ────────────────────────────────
  router.get(
    "/ledgers",
    requireRoles("admin", "retailer"),
    validate(warehouseHeaderSchema, "headers"),
    validate(settlementSchemas.ledgerQuery, "query"),
    controller.getLedgers,
  );

  // ── Settlement / Payout History (admin + retailer) ───────────────────
  router.get(
    "/",
    requireRoles("admin", "retailer"),
    validate(warehouseHeaderSchema, "headers"),
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

  // ── Admin Settlement Routes ──────────────────────────────────────────

  // Endpoint 1: Financial summary for a retailer
  router.get(
    "/admin/retailers/:retailerId/summary",
    requireRoles("admin"),
    controller.getAdminRetailerSummary,
  );

  // Endpoint 2: All unsettled ledger rows (dual-line, FIFO order)
  router.get(
    "/admin/retailers/:retailerId/ledgers/unsettled",
    requireRoles("admin"),
    controller.getAdminUnsettledLedgers,
  );

  // Endpoint 3: Full payout history for a retailer
  router.get(
    "/admin/retailers/:retailerId/history",
    requireRoles("admin"),
    controller.getAdminSettlementHistory,
  );

  // Endpoint 4: Execute FIFO payout (admin-initiated)
  router.post(
    "/admin/execute",
    requireRoles("admin"),
    validate(settlementSchemas.adminSettlementExecution),
    controller.executeAdminFifoPayout,
  );

  // ── Retailer Settlement Routes ─────────────────────────────────────────

  // Endpoint 1: Get Retailer Ledgers (Tab 1 & 2)
  router.get(
    "/retailer/ledgers",
    requireRoles("retailer"),
    validate(warehouseHeaderSchema, "headers"),
    validate(settlementSchemas.ledgerQuery, "query"),
    controller.getRetailerLedgers,
  );

  // Endpoint 2: Get Settlement History (Tab 3)
  router.get(
    "/retailer/history",
    requireRoles("retailer"),
    controller.getRetailerSettlementHistory,
  );

  // Endpoint 3: Get Settlement Details Breakdown (Razorpay style)
  router.get(
    "/retailer/history/:settlementId",
    requireRoles("retailer"),
    controller.getRetailerSettlementDetails,
  );

  return router;
}
