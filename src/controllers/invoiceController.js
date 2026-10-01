import { asyncHandler } from "../middleware/errorHandler.js";
import { invoiceRepository as defaultInvoiceRepo } from "../repositories/invoiceRepository.js";
import { logger } from "../utils/logger.js";

/**
 * Factory to create an Invoice Controller.
 *
 * @param {Object} [deps]
 * @param {Object} [deps.invoiceService]
 * @param {Object} [deps.invoiceRepository]
 * @returns {Object} Invoice controller actions
 */
export function createInvoiceController({ invoiceService, invoiceRepository } = {}) {
  let resolvedInvoiceRepo = invoiceRepository;
  let resolvedInvoiceService = invoiceService;

  async function getRepo() {
    if (!resolvedInvoiceRepo) {
      resolvedInvoiceRepo = defaultInvoiceRepo;
    }
    return resolvedInvoiceRepo;
  }

  async function getService() {
    if (!resolvedInvoiceService) {
      const repo = await getRepo();
      const { createInvoiceService } = await import("../services/invoiceService.js");
      const { OrderRepository } = await import("../repositories/orderRepository.js");
      const { ProductRepository } = await import("../repositories/productRepository.js");
      const { getSupabase } = await import("../db/index.js");
      const supabase = getSupabase();
      resolvedInvoiceService = createInvoiceService({
        invoiceRepository: repo,
        orderRepository: new OrderRepository(supabase),
        productRepository: new ProductRepository(),
      });
    }
    return resolvedInvoiceService;
  }

  /**
   * Get all invoices for an order.
   * Ensures seller invoices and user-levied fee receipts (Delivery & Platform) are generated.
   * GET /api/v1/orders/:orderId/invoices
   */
  const getOrderInvoices = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const svc = await getService();

    // Ensure all invoices (seller tax invoice, delivery receipt, platform receipt) exist in DB
    try {
      await svc.ensureOrderInvoices(orderId);
    } catch (autoGenErr) {
      logger.warn("Could not auto-generate missing invoices on fetch:", {
        orderId,
        error: autoGenErr.message,
      });
    }

    const repo = await getRepo();
    const invoices = await repo.findByOrderId(orderId);

    const formattedInvoices = (invoices || []).map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number || inv.invoiceNumber,
      invoiceType: inv.invoice_type || inv.invoiceType,
      totalAmount: Number(inv.total_amount ?? inv.totalAmount ?? 0),
      issuedAt: inv.issued_at || inv.issuedAt || inv.created_at,
      downloadUrl: `/api/v1/orders/${orderId}/invoices/${inv.id}/download`,
    }));

    return res.json(formattedInvoices);
  });

  /**
   * Stream and download an invoice PDF.
   * By default merges all order invoices and fee receipts into a single multi-page PDF.
   * GET /api/v1/orders/:orderId/invoices/:invoiceId/download
   * GET /api/v1/orders/:orderId/invoices/download
   */
  const downloadInvoicePdf = asyncHandler(async (req, res) => {
    const { orderId, invoiceId, id } = req.params;
    const targetInvoiceId = invoiceId || id || orderId;
    const userId = req.user?.id;
    const single = req.query.single === "true";

    const svc = await getService();
    const pdfStream = await svc.streamInvoicePdf(targetInvoiceId, userId, {
      mergeOrderInvoices: !single,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Invoice-${orderId || targetInvoiceId}.pdf"`
    );

    pdfStream.on("error", (err) => {
      logger.error("Error streaming invoice PDF:", {
        invoiceId: targetInvoiceId,
        error: err.message,
      });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Failed to generate invoice PDF stream",
        });
      }
    });

    pdfStream.pipe(res);
  });

  return {
    getOrderInvoices,
    downloadInvoicePdf,
    downloadOrderInvoicesPdf: downloadInvoicePdf,
  };
}

export class InvoiceController {
  constructor(deps = {}) {
    const controller = createInvoiceController(deps);
    this.getOrderInvoices = controller.getOrderInvoices;
    this.downloadInvoicePdf = controller.downloadInvoicePdf;
  }
}

export default createInvoiceController;
