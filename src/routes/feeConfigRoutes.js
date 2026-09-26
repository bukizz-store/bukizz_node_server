import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
  cartCalculationSchema,
  gstSlabSchemas,
  feeConfigSchemas,
  paramSchemas,
} from "../models/schemas.js";
import { createFeeConfigController } from "../controllers/feeConfigController.js";

/**
 * Fee Configuration & GST Routes Factory
 *
 * @param {Object} [dependenciesOrController]
 * @returns {express.Router}
 */
export function createFeeConfigRoutes(dependenciesOrController = {}) {
  const router = express.Router();
  const ctrl =
    dependenciesOrController?.previewCartCalculation
      ? dependenciesOrController
      : (dependenciesOrController?.feeConfigController ||
         createFeeConfigController(dependenciesOrController));

  // 1. POST /cart/preview: Public/Customer preview with validate(cartCalculationSchema)
  router.post(
    "/cart/preview",
    validate(cartCalculationSchema),
    ctrl.previewCartCalculation
  );

  // Protected under authenticateToken, requireRoles('admin')
  const adminAuth = [authenticateToken, requireRoles("admin")];

  // GST Tax Slabs
  // GET /gst-slabs: Accessible for retailers & admin to populate tax slab dropdowns
  router.get("/gst-slabs", ctrl.getGstSlabs);

  // POST /gst-slabs (validate gstSlabSchemas.create)
  router.post(
    "/gst-slabs",
    ...adminAuth,
    validate(gstSlabSchemas.create),
    ctrl.createGstSlab
  );

  // PUT /gst-slabs/:id (validate gstSlabSchemas.update)
  router.put(
    "/gst-slabs/:id",
    ...adminAuth,
    validate(paramSchemas.id, "params"),
    validate(gstSlabSchemas.update),
    ctrl.updateGstSlab
  );

  // System Fee Configurations
  // GET /fees
  router.get("/fees", ...adminAuth, ctrl.getFeeConfigurations);
  router.get("/fee-configurations", ...adminAuth, ctrl.getFeeConfigurations);

  // PUT /fees/:configKey (validate feeConfigSchemas.update)
  router.put(
    "/fees/:configKey",
    ...adminAuth,
    validate(paramSchemas.configKey, "params"),
    validate(feeConfigSchemas.update),
    ctrl.updateFeeConfiguration
  );
  router.put(
    "/fee-configurations/:configKey",
    ...adminAuth,
    validate(paramSchemas.configKey, "params"),
    validate(feeConfigSchemas.update),
    ctrl.updateFeeConfiguration
  );

  return router;
}

export default createFeeConfigRoutes;
