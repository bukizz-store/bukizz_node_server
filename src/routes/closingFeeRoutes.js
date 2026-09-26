import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
  closingFeeSlabSchemas,
  paramSchemas,
} from "../models/schemas.js";
import { createClosingFeeController } from "../controllers/closingFeeController.js";

/**
 * Closing Fee Slabs Routes Factory
 *
 * @param {Object} [dependenciesOrController]
 * @returns {express.Router}
 */
export function createClosingFeeRoutes(dependenciesOrController = {}) {
  const router = express.Router();
  const ctrl =
    dependenciesOrController?.getSlabs
      ? dependenciesOrController
      : (dependenciesOrController?.closingFeeController ||
         createClosingFeeController(dependenciesOrController));

  // Protected under authenticateToken, requireRoles('admin')
  const adminAuth = [authenticateToken, requireRoles("admin")];

  // GET / - Retrieve all closing fee slabs
  router.get("/", ...adminAuth, ctrl.getSlabs);

  // POST / - Create a new tiered closing fee slab (validate closingFeeSlabSchemas.create)
  router.post(
    "/",
    ...adminAuth,
    validate(closingFeeSlabSchemas.create),
    ctrl.createSlab
  );

  // PUT /:id - Update an existing closing fee slab (validate closingFeeSlabSchemas.update)
  router.put(
    "/:id",
    ...adminAuth,
    validate(paramSchemas.id, "params"),
    validate(closingFeeSlabSchemas.update),
    ctrl.updateSlab
  );

  // DELETE /:id - Remove a closing fee slab
  router.delete(
    "/:id",
    ...adminAuth,
    validate(paramSchemas.id, "params"),
    ctrl.deleteSlab
  );

  return router;
}

export default createClosingFeeRoutes;
