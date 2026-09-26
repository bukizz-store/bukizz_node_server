import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { invoiceSchemas } from "../models/schemas.js";
import { createInvoiceController } from "../controllers/invoiceController.js";

/**
 * Creates and configures the invoice router.
 *
 * @param {Object} [dependenciesOrController] - Injected invoice controller or dependencies container
 * @returns {Router} Configured Express router
 */
export const createInvoiceRoutes = (dependenciesOrController = {}) => {
  const router = Router({ mergeParams: true });
  const ctrl =
    dependenciesOrController?.getOrderInvoices
      ? dependenciesOrController
      : dependenciesOrController?.invoiceController ||
        createInvoiceController(dependenciesOrController);

  router.use(authenticateToken);

  router.get(
    "/:orderId/invoices",
    validate(invoiceSchemas.orderInvoiceListParams, "params"),
    ctrl.getOrderInvoices
  );

  router.get(
    "/:orderId/invoices/download",
    validate(invoiceSchemas.orderInvoiceListParams, "params"),
    ctrl.downloadInvoicePdf
  );

  router.get(
    "/:orderId/invoices/:invoiceId/download",
    validate(invoiceSchemas.downloadParams, "params"),
    ctrl.downloadInvoicePdf
  );

  return router;
};

export default createInvoiceRoutes;
