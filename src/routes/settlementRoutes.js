import express from "express";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { settlementSchemas } from "../models/schemas.js";
import Joi from "joi";

/**
 * Settlement Routes Factory
 * @param {Object} dependencies - DI container or controller
 * @returns {Router} Express router with settlement routes.
 */
export default function settlementRoutes(dependencies = {}) {
  const router = express.Router();
  const controller =
    dependencies.settlementController || dependencies;
  const accessService = dependencies.accessService;

  // All settlement routes require authentication
  router.use(authenticateToken);

  // Header Validation for Retailers
  const warehouseHeaderSchema = Joi.object({
    "x-warehouse-id": Joi.string().uuid().required(),
  }).unknown(true);

  // ─── Global Settlement Queries ───────────────────────────────────────
  router.get(
    "/summary",
    requirePermissions(accessService, "settlements:read"),
    validate(warehouseHeaderSchema, "headers"),
    controller.getSummary,
  );

  router.get(
    "/ledgers",
    requirePermissions(accessService, "settlements:read"),
    validate(warehouseHeaderSchema, "headers"),
    validate(settlementSchemas.ledgerQuery, "query"),
    controller.getLedgers,
  );

  router.get(
    "/",
    requirePermissions(accessService, "settlements:read"),
    validate(warehouseHeaderSchema, "headers"),
    validate(settlementSchemas.settlementQuery, "query"),
    controller.getSettlements,
  );

  // ─── Financial Mutations (Admin RBAC) ────────────────────────────────
  router.post(
    "/adjustments",
    requirePermissions(accessService, "settlements:manage"),
    validate(settlementSchemas.manualAdjustment),
    controller.addManualAdjustment,
  );

  router.post(
    "/execute",
    requirePermissions(accessService, "settlements:manage"),
    validate(settlementSchemas.settlementExecution),
    controller.executeSettlement,
  );

  // ─── Admin Settlement Endpoints (RBAC Guarded) ───────────────────────

  router.get(
    "/admin/retailers/:retailerId/summary",
    requirePermissions(accessService, "settlements:read"),
    controller.getAdminRetailerSummary,
  );

  router.get(
    "/admin/retailers/:retailerId/ledgers/unsettled",
    requirePermissions(accessService, "settlements:read"),
    controller.getAdminUnsettledLedgers,
  );

  router.get(
    "/admin/retailers/:retailerId/history",
    requirePermissions(accessService, "settlements:read"),
    controller.getAdminSettlementHistory,
  );

  router.post(
    "/admin/execute",
    requirePermissions(accessService, "settlements:manage"),
    validate(settlementSchemas.adminSettlementExecution),
    controller.executeAdminFifoPayout,
  );

  router.get(
    "/admin/due-today",
    requirePermissions(accessService, "settlements:read"),
    controller.getAdminDueSettlements,
  );

  // ─── Retailer Settlement Endpoints ───────────────────────────────────

  router.get(
    "/retailer/ledgers",
    requirePermissions(accessService, "retailers:settlements:read"),
    validate(warehouseHeaderSchema, "headers"),
    validate(settlementSchemas.ledgerQuery, "query"),
    controller.getRetailerLedgers,
  );

  router.get(
    "/retailer/history",
    requirePermissions(accessService, "retailers:settlements:read"),
    controller.getRetailerSettlementHistory,
  );

  router.get(
    "/retailer/history/:settlementId",
    requirePermissions(accessService, "retailers:settlements:read"),
    controller.getRetailerSettlementDetails,
  );

  return router;
}
