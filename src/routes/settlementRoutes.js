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

  return router;
}
