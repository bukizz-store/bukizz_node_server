import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
  variantComponentSchemas,
  paramSchemas,
} from "../models/schemas.js";
import { createVariantComponentController } from "../controllers/variantComponentController.js";

/**
 * Variant Component Routes Factory
 *
 * @param {Object} [dependenciesOrController]
 * @returns {express.Router}
 */
export function createVariantComponentRoutes(dependenciesOrController = {}) {
  const router = express.Router();
  const ctrl =
    dependenciesOrController?.setComponents
      ? dependenciesOrController
      : (dependenciesOrController?.variantComponentController ||
         createVariantComponentController(dependenciesOrController));

  // 1. GET /variants/:variantId/components: Public/Retailer read
  router.get(
    ["/variants/:variantId/components", "/:variantId/components"],
    validate(paramSchemas.variantId, "params"),
    ctrl.getComponents
  );

  // Protected under authenticateToken, requireRoles('retailer', 'admin')
  const retailerAdminAuth = [
    authenticateToken,
    requireRoles("retailer", "admin"),
  ];

  // 2. PUT /products/:productId/variants/:variantId/components (validate variantComponentSchemas.setComponents)
  router.put(
    [
      "/products/:productId/variants/:variantId/components",
      "/:productId/variants/:variantId/components",
    ],
    ...retailerAdminAuth,
    validate(variantComponentSchemas.setComponents),
    ctrl.setComponents
  );

  // 3. POST /products/:productId/variants/:variantId/revert-flat (validate variantComponentSchemas.revertToFlatGst)
  router.post(
    [
      "/products/:productId/variants/:variantId/revert-flat",
      "/:productId/variants/:variantId/revert-flat",
    ],
    ...retailerAdminAuth,
    validate(variantComponentSchemas.revertToFlatGst),
    ctrl.revertToFlatGst
  );

  return router;
}

export default createVariantComponentRoutes;
