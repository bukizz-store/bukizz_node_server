import { invoiceRepository as defaultInvoiceRepo } from "../repositories/invoiceRepository.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { orderItemComponentRepository } from "../repositories/orderItemComponentRepository.js";
import { orderItemFeeRepository } from "../repositories/orderItemFeeRepository.js";
import { executeSupabaseQuery } from "../db/index.js";
import { buildInvoicePdfStream } from "../utils/pdfInvoiceGenerator.js";
import { logger } from "../utils/logger.js";

/**
 * Extracts a clean order sequence number from an order identifier.
 * Strips 'BKZ-' and internal tracking segments so only the primary sequence remains.
 * (e.g. 'BKZ-9481' -> '9481' or 'BKZ-L9X8K-9481' -> '9481').
 *
 * @param {string} orderNumber
 * @returns {string}
 */
export function extractCleanOrderNumber(orderNumber) {
  if (!orderNumber) return "0000";
  const str = String(orderNumber).trim();

  // Check if string ends with digits preceded by hyphen (e.g. BKZ-9481, BKZ-L9X8K-9481)
  const trailingDigitsMatch = str.match(/-(\d+)$/);
  if (trailingDigitsMatch) {
    return trailingDigitsMatch[1];
  }

  // Remove leading BKZ- or ORD- prefix
  const cleaned = str.replace(/^(BKZ|ORD)-/i, "");
  const parts = cleaned.split("-");
  return parts[parts.length - 1] || cleaned;
}

/**
 * Calculates the Indian Financial Year suffix from a given date.
 * Fiscal year in India runs from April 1 to March 31.
 * e.g., Sept 2026 -> '27' (FY 2026-27), Jan 2027 -> '27', April 2027 -> '28' (FY 2027-28)
 *
 * @param {Date|string} [date]
 * @returns {string} 2-digit fiscal year suffix (e.g. '27')
 */
export function getGstFinancialYear(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const fullYear = d.getFullYear();
  const endYear = month >= 4 ? fullYear + 1 : fullYear;
  return String(endYear).slice(-2);
}

/**
 * Creates an instance of InvoiceService.
 *
 * @param {Object} deps
 * @param {Object} [deps.invoiceRepository]
 * @param {Object} [deps.orderRepository]
 * @param {Object} [deps.productRepository]
 * @returns {Object} InvoiceService instance
 */
export function createInvoiceService({
  invoiceRepository = defaultInvoiceRepo,
  orderRepository = new OrderRepository(),
  productRepository = new ProductRepository(),
} = {}) {
  /**
   * Generates invoices and receipts upon order item delivery:
   * 1. Seller Tax Invoice (${retailerCode}-27/${orderSeq})
   * 2. Bukizz Platform Fee Receipt (${cityCode}-27/PF-${orderSeq}) if cart_platform_fee > 0
   * 3. Bukizz Delivery Fee Receipt (${cityCode}-27/DF-${orderSeq}) if delivery_charge > 0
   *
   * @param {string} orderId
   * @param {string} deliveredItemId
   * @returns {Promise<Object>} Generated invoices
   */
  async function generateInvoicesOnDelivery(orderId, deliveredItemId) {
    try {
      logger.info("Generating invoices on delivery:", { orderId, deliveredItemId });

      // 1. Fetch order with items
      const order = await orderRepository.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // 2. Fetch raw order items to ensure complete financial and component attributes
      const allOrderItems = await executeSupabaseQuery((supabase) =>
        supabase.from("order_items").select("*").eq("order_id", orderId)
      );

      const targetItem =
        (allOrderItems || []).find((i) => i.id === deliveredItemId) ||
        order.items?.find((i) => i.id === deliveredItemId);

      if (!targetItem) {
        throw new Error(`Delivered item ${deliveredItemId} not found in order ${orderId}`);
      }

      // 3. Resolve warehouse and city code
      const warehouseId =
        targetItem.warehouse_id || targetItem.warehouseId || order.warehouse_id;
      let cityCode = "CNB";
      let warehouse = null;

      if (warehouseId) {
        const whRows = await executeSupabaseQuery((supabase) =>
          supabase
            .from("warehouse")
            .select("id, name, city_code, warehouse_code")
            .eq("id", warehouseId)
            .limit(1)
        );
        if (whRows && whRows.length > 0) {
          warehouse = whRows[0];
          cityCode = warehouse.city_code || "CNB";
        }
      }

      // 4. Resolve retailer profile & retailer code
      let retailerId = null;
      let retailerCode = "FAI";
      let retailerUser = null;
      let retailerData = null;

      if (warehouseId) {
        const rwRows = await executeSupabaseQuery((supabase) =>
          supabase
            .from("retailer_warehouse")
            .select("retailer_id")
            .eq("warehouse_id", warehouseId)
            .limit(1)
        );
        if (rwRows && rwRows.length > 0) {
          retailerId = rwRows[0].retailer_id;
        }
      }

      if (retailerId) {
        const uRows = await executeSupabaseQuery((supabase) =>
          supabase
            .from("users")
            .select("id, full_name, email, role, retailer_code")
            .eq("id", retailerId)
            .limit(1)
        );
        if (uRows && uRows.length > 0) {
          retailerUser = uRows[0];
          retailerCode = retailerUser.retailer_code || "FAI";
        }

        const rdRows = await executeSupabaseQuery((supabase) =>
          supabase
            .from("retailer_data")
            .select("retailer_id, display_name, owner_name, gstin, pan")
            .eq("retailer_id", retailerId)
            .limit(1)
        );
        if (rdRows && rdRows.length > 0) {
          retailerData = rdRows[0];
        }
      }

      const orderNumber = order.order_number || order.orderNumber || "";
      const customerId = order.user_id || order.userId;
      const orderSeq = extractCleanOrderNumber(orderNumber);
      const financialYear = getGstFinancialYear(order.created_at || new Date());
      const generatedInvoices = [];

      // ────────────────────────────────────────────────────────────────────────
      // 5. SELLER TAX INVOICE: ${retailerCode}-${financialYear}/${seq} (6-digit sequential)
      // ────────────────────────────────────────────────────────────────────────
      const existingSellerInvoice = await invoiceRepository.existsForOrderItemAndType(
        targetItem.id,
        "SELLER_TAX_INVOICE"
      );

      let sellerInvoice = existingSellerInvoice;
      if (!existingSellerInvoice) {
        const seq = await invoiceRepository.getNextSequence(retailerCode, financialYear);
        const sellerInvoiceNumber = `${retailerCode}-${financialYear}/${String(seq).padStart(6, "0")}`;
        // Query dedicated order_item_components table
        let dedicatedComponents = [];
        try {
          dedicatedComponents = await orderItemComponentRepository.getByOrderItemId(targetItem.id);
        } catch (cErr) {
          logger.warn("Could not query order_item_components in generateInvoicesOnDelivery:", cErr.message);
        }

        let taxableAmount = 0;
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        let totalAmount = 0;
        let componentsCount = 0;

        if (dedicatedComponents && dedicatedComponents.length > 0) {
          componentsCount = dedicatedComponents.length;
          dedicatedComponents.forEach((c) => {
            taxableAmount += Number(c.base_price || 0);
            cgstAmount += Number(c.cgst_amount || 0);
            sgstAmount += Number(c.sgst_amount || 0);
            igstAmount += Number(c.igst_amount || 0);
            totalAmount += Number(c.total_price || 0);
          });
        } else {
          // Fallback to legacy parent_item_id check in order_items
          const childComponents = (allOrderItems || []).filter(
            (i) => i.parent_item_id === targetItem.id
          );

          if (childComponents.length > 0) {
            componentsCount = childComponents.length;
            childComponents.forEach((c) => {
              const qty = Number(c.quantity || 1);
              const base = Number(c.base_price || 0) * qty;
              taxableAmount += base;
              cgstAmount += Number(c.cgst_amount || 0);
              sgstAmount += Number(c.sgst_amount || 0);
              igstAmount += Number(c.igst_amount || 0);
              totalAmount += Number(
                c.total_price || base + (c.cgst_amount || 0) + (c.sgst_amount || 0) + (c.igst_amount || 0)
              );
            });
          } else {
            // Single standalone item
            const qty = Number(targetItem.quantity || 1);
            const total = Number(targetItem.total_price ?? targetItem.totalPrice ?? 0);
            const cgst = Number(targetItem.cgst_amount ?? targetItem.cgstAmount ?? 0);
            const sgst = Number(targetItem.sgst_amount ?? targetItem.sgstAmount ?? 0);
            const igst = Number(targetItem.igst_amount ?? targetItem.igstAmount ?? 0);
            const totalGst = cgst + sgst + igst;
            const base =
              targetItem.base_price !== undefined && targetItem.base_price !== null
                ? Number(targetItem.base_price) * qty
                : targetItem.basePrice !== undefined && targetItem.basePrice !== null
                ? Number(targetItem.basePrice) * qty
                : total - totalGst;

            taxableAmount = base;
            cgstAmount = cgst;
            sgstAmount = sgst;
            igstAmount = igst;
            totalAmount = total;
            componentsCount = 1;
          }
        }

        sellerInvoice = await invoiceRepository.createInvoice({
          invoice_number: sellerInvoiceNumber,
          invoice_type: "SELLER_TAX_INVOICE",
          order_id: order.id,
          order_item_id: targetItem.id,
          retailer_id: retailerId,
          customer_id: customerId,
          financial_year: financialYear,
          city_code: cityCode,
          taxable_amount: Math.round(taxableAmount * 100) / 100,
          cgst_amount: Math.round(cgstAmount * 100) / 100,
          sgst_amount: Math.round(sgstAmount * 100) / 100,
          igst_amount: Math.round(igstAmount * 100) / 100,
          total_amount: Math.round(totalAmount * 100) / 100,
          metadata: {
            item_title: targetItem.title,
            components_count: componentsCount,
            retailer_name: retailerData?.display_name || retailerUser?.full_name || "Retailer",
            retailer_code: retailerCode,
          },
          issued_at: new Date().toISOString(),
        });
      }
      if (sellerInvoice) generatedInvoices.push(sellerInvoice);

      // ────────────────────────────────────────────────────────────────────────
      // Query order_item_fees for customer fees (payer_party = 'USER')
      // ────────────────────────────────────────────────────────────────────────
      let customerFees = [];
      try {
        const itemIds = (allOrderItems || []).map((i) => i.id).filter(Boolean);
        if (itemIds.length > 0) {
          customerFees = await executeSupabaseQuery((supabase) =>
            supabase
              .from("order_item_fees")
              .select("*")
              .in("order_item_id", itemIds)
              .eq("payer_party", "USER")
          );
        }
      } catch (fErr) {
        logger.warn("Could not query order_item_fees for customer fees:", fErr.message);
      }

      const deliveryFeeItem = (customerFees || []).find((f) =>
        ["DELIVERY_CHARGE", "SHIPPING_FEE"].includes((f.fee_code || "").toUpperCase())
      );
      const platformFeeItem = (customerFees || []).find((f) =>
        ["PLATFORM_FEE", "CART_PLATFORM_FEE"].includes((f.fee_code || "").toUpperCase())
      );

      // ────────────────────────────────────────────────────────────────────────
      // 6. BUKIZZ PLATFORM FEE RECEIPT (PF): ${cityCode}-27/PF-${orderSeq}
      // ────────────────────────────────────────────────────────────────────────
      let cartPlatformFee = Number(
        order.cart_platform_fee ??
        order.cartPlatformFee ??
        order.metadata?.orderSummary?.cartPlatformFee ??
        order.metadata?.orderSummary?.taxSummary?.cartPlatformFee ??
        0
      );
      let feeGst = Number(
        order.cart_platform_fee_gst ??
        order.cartPlatformFeeGst ??
        order.metadata?.orderSummary?.cartPlatformFeeGst ??
        order.metadata?.orderSummary?.taxSummary?.cartPlatformFeeGst ??
        0
      );

      if (platformFeeItem) {
        cartPlatformFee = Number(platformFeeItem.taxable_amount || 0);
        feeGst = Number(platformFeeItem.cgst_amount || 0) + Number(platformFeeItem.sgst_amount || 0) + Number(platformFeeItem.igst_amount || 0);
      } else if (cartPlatformFee === 0 && (Number(targetItem.platform_fee || 0) > 0 || Number(order.metadata?.orderSummary?.platformFee || 0) > 0)) {
        const rawPf = Number(targetItem.platform_fee || order.metadata?.orderSummary?.platformFee || 0);
        cartPlatformFee = Math.round((rawPf / 1.18) * 100) / 100;
        feeGst = Math.round((rawPf - cartPlatformFee) * 100) / 100;
      }

      let platformReceipt = null;
      if (cartPlatformFee > 0 || (cartPlatformFee + feeGst) > 0) {
        const existingPf = await invoiceRepository.existsForOrderAndType(
          order.id,
          "BUKIZZ_PLATFORM_RECEIPT"
        );

        if (!existingPf) {
          const pfSeries = `${cityCode}_PF`;
          const seq = await invoiceRepository.getNextSequence(pfSeries, financialYear);
          const pfNumber = `${cityCode}-${financialYear}/PF-${String(seq).padStart(5, "0")}`;

          let taxable = cartPlatformFee;
          let cgst = feeGst / 2;
          let sgst = feeGst / 2;
          let igst = 0;
          let total = cartPlatformFee + feeGst;

          if (platformFeeItem) {
            taxable = Number(platformFeeItem.taxable_amount || 0);
            cgst = Number(platformFeeItem.cgst_amount || 0);
            sgst = Number(platformFeeItem.sgst_amount || 0);
            igst = Number(platformFeeItem.igst_amount || 0);
            total = Number(platformFeeItem.total_fee_amount || (taxable + cgst + sgst + igst));
          } else if (feeGst === 0 && cartPlatformFee > 0) {
            taxable = Math.round((cartPlatformFee / 1.18) * 100) / 100;
            const gst = Math.round((cartPlatformFee - taxable) * 100) / 100;
            cgst = Math.round((gst / 2) * 100) / 100;
            sgst = Math.round((gst - cgst) * 100) / 100;
            total = cartPlatformFee;
          }

          platformReceipt = await invoiceRepository.createInvoice({
            invoice_number: pfNumber,
            invoice_type: "BUKIZZ_PLATFORM_RECEIPT",
            order_id: order.id,
            order_item_id: null,
            retailer_id: null,
            customer_id: customerId,
            financial_year: financialYear,
            city_code: cityCode,
            taxable_amount: Math.round(taxable * 100) / 100,
            cgst_amount: Math.round(cgst * 100) / 100,
            sgst_amount: Math.round(sgst * 100) / 100,
            igst_amount: Math.round(igst * 100) / 100,
            total_amount: Math.round(total * 100) / 100,
            metadata: {
              fee_type: "cart_platform_fee",
              sac_code: "9983",
              tax_rate: 18,
            },
            issued_at: new Date().toISOString(),
          });
        } else {
          platformReceipt = existingPf;
        }
      }
      if (platformReceipt) generatedInvoices.push(platformReceipt);

      // ────────────────────────────────────────────────────────────────────────
      // 7. BUKIZZ DELIVERY FEE RECEIPT (DF): ${cityCode}-27/DF-${orderSeq}
      // ────────────────────────────────────────────────────────────────────────
      let deliveryCharge = Number(
        order.delivery_charge ??
        order.deliveryCharge ??
        order.deliveryFee ??
        order.metadata?.orderSummary?.deliveryFee ??
        order.metadata?.orderSummary?.taxSummary?.totalDeliveryFee ??
        targetItem.delivery_fee ??
        targetItem.deliveryFee ??
        0
      );

      let deliveryReceipt = null;
      if (deliveryFeeItem || deliveryCharge > 0) {
        const existingDf = await invoiceRepository.existsForOrderAndType(
          order.id,
          "BUKIZZ_DELIVERY_RECEIPT"
        );

        if (!existingDf) {
          const dfSeries = `${cityCode}_DF`;
          const seq = await invoiceRepository.getNextSequence(dfSeries, financialYear);
          const dfNumber = `${cityCode}-${financialYear}/DF-${String(seq).padStart(5, "0")}`;

          let taxable = 0;
          let cgst = 0;
          let sgst = 0;
          let igst = 0;
          let total = 0;

          if (deliveryFeeItem) {
            taxable = Number(deliveryFeeItem.taxable_amount || 0);
            cgst = Number(deliveryFeeItem.cgst_amount || 0);
            sgst = Number(deliveryFeeItem.sgst_amount || 0);
            igst = Number(deliveryFeeItem.igst_amount || 0);
            total = Number(deliveryFeeItem.total_fee_amount || (taxable + cgst + sgst + igst));
          } else {
            const delGst = Number(
              order.delivery_charge_gst ?? order.deliveryChargeGst ?? 0
            );
            if (delGst > 0) {
              taxable = deliveryCharge;
              cgst = delGst / 2;
              sgst = delGst / 2;
              total = deliveryCharge + delGst;
            } else {
              taxable = Math.round((deliveryCharge / 1.18) * 100) / 100;
              const gst = Math.round((deliveryCharge - taxable) * 100) / 100;
              cgst = Math.round((gst / 2) * 100) / 100;
              sgst = Math.round((gst - cgst) * 100) / 100;
              total = deliveryCharge;
            }
          }

          deliveryReceipt = await invoiceRepository.createInvoice({
            invoice_number: dfNumber,
            invoice_type: "BUKIZZ_DELIVERY_RECEIPT",
            order_id: order.id,
            order_item_id: targetItem.id,
            customer_id: customerId,
            financial_year: financialYear,
            city_code: cityCode,
            taxable_amount: Math.round(taxable * 100) / 100,
            cgst_amount: Math.round(cgst * 100) / 100,
            sgst_amount: Math.round(sgst * 100) / 100,
            igst_amount: Math.round(igst * 100) / 100,
            total_amount: Math.round(total * 100) / 100,
            metadata: {
              fee_type: "delivery_charge",
              sac_code: "9968",
              tax_rate: 18,
            },
            issued_at: new Date().toISOString(),
          });
        } else {
          deliveryReceipt = existingDf;
        }
      }
      if (deliveryReceipt) generatedInvoices.push(deliveryReceipt);

      return {
        sellerInvoice,
        platformReceipt,
        deliveryReceipt,
        all: generatedInvoices,
      };
    } catch (error) {
      logger.error("Error in generateInvoicesOnDelivery:", error);
      throw error;
    }
  }

  /**
   * Generates cancellation fee invoices when an order/item is cancelled.
   *
   * @param {Object} order
   * @param {Object} retainedCharges
   * @param {string} [vendorFaultRetailerId]
   * @returns {Promise<Array<Object>>}
   */
  async function generateCancellationInvoices(order, retainedCharges = {}, vendorFaultRetailerId = null) {
    try {
      const orderSeq = extractCleanOrderNumber(order.order_number || order.orderNumber);
      const customerId = order.user_id || order.userId;
      const cityCode = order.city_code || "CNB";
      const financialYear = getGstFinancialYear(order.created_at || new Date());
      const createdInvoices = [];

      // 1. Customer Instant Refund Processing Fee
      const irfAmount = Number(retainedCharges.instantRefundFee || 0);
      if (irfAmount > 0) {
        const exists = await invoiceRepository.existsForOrderAndType(
          order.id,
          "BUKIZZ_INSTANT_REFUND"
        );

        if (!exists) {
          const irfSeries = `${cityCode}_IR`;
          const seq = await invoiceRepository.getNextSequence(irfSeries, financialYear);
          const irfNumber = `${cityCode}-${financialYear}/IR-${String(seq).padStart(4, "0")}`;

          const taxable = Math.round((irfAmount / 1.18) * 100) / 100;
          const gst = Math.round((irfAmount - taxable) * 100) / 100;
          const cgst = Math.round((gst / 2) * 100) / 100;
          const sgst = Math.round((gst - cgst) * 100) / 100;

          const inv = await invoiceRepository.createInvoice({
            invoice_number: irfNumber,
            invoice_type: "BUKIZZ_INSTANT_REFUND",
            order_id: order.id,
            customer_id: customerId,
            financial_year: financialYear,
            city_code: cityCode,
            taxable_amount: taxable,
            cgst_amount: cgst,
            sgst_amount: sgst,
            igst_amount: 0.0,
            total_amount: irfAmount,
            metadata: {
              sac_code: "9983",
              description: "Bukizz Instant Refund Processing Fee",
            },
            issued_at: new Date().toISOString(),
          });
          createdInvoices.push(inv);
        }
      }

      // 2. Vendor Cancellation Penalty Charge
      if (vendorFaultRetailerId) {
        let vendorCode = "FAI";
        const uRows = await executeSupabaseQuery((supabase) =>
          supabase
            .from("users")
            .select("retailer_code")
            .eq("id", vendorFaultRetailerId)
            .limit(1)
        );
        if (uRows && uRows[0]?.retailer_code) {
          vendorCode = uRows[0].retailer_code;
        }

        const exists = await invoiceRepository.existsForOrderAndType(
          order.id,
          "VENDOR_CANCELLATION_FEE"
        );

        if (!exists) {
          const cfSeries = `${vendorCode}_CF`;
          const seq = await invoiceRepository.getNextSequence(cfSeries, financialYear);
          const cfNumber = `${vendorCode}-${financialYear}/CF-${String(seq).padStart(4, "0")}`;

          const penaltyAmount = Number(
            retainedCharges.cancellationPenalty ||
            retainedCharges.vendorCancellationFee ||
            50.0
          );
          const taxable = Math.round((penaltyAmount / 1.18) * 100) / 100;
          const gst = Math.round((penaltyAmount - taxable) * 100) / 100;
          const cgst = Math.round((gst / 2) * 100) / 100;
          const sgst = Math.round((gst - cgst) * 100) / 100;

          const inv = await invoiceRepository.createInvoice({
            invoice_number: cfNumber,
            invoice_type: "VENDOR_CANCELLATION_FEE",
            order_id: order.id,
            retailer_id: vendorFaultRetailerId,
            customer_id: order.user_id,
            financial_year: financialYear,
            city_code: cityCode,
            taxable_amount: taxable,
            cgst_amount: cgst,
            sgst_amount: sgst,
            igst_amount: 0.0,
            total_amount: penaltyAmount,
            metadata: {
              sac_code: "9983",
              description: "Vendor Order Cancellation Penalty Fee",
            },
            issued_at: new Date().toISOString(),
          });
          createdInvoices.push(inv);
        }
      }

      return createdInvoices;
    } catch (error) {
      logger.error("Error in generateCancellationInvoices:", error);
      throw error;
    }
  }

  /**
   * Generates a replacement charge invoice to the vendor (${retailerCode}-27/RF-${orderSeq}).
   *
   * @param {Object} order
   * @param {string} retailerId
   * @returns {Promise<Object>}
   */
  async function generateReplacementInvoice(order, retailerId) {
    try {
      const orderSeq = extractCleanOrderNumber(order.order_number || order.orderNumber);
      const customerId = order.user_id || order.userId;
      const cityCode = order.city_code || "CNB";
      const financialYear = getGstFinancialYear(order.created_at || new Date());

      let retailerCode = "FAI";
      if (retailerId) {
        const uRows = await executeSupabaseQuery((supabase) =>
          supabase
            .from("users")
            .select("retailer_code")
            .eq("id", retailerId)
            .limit(1)
        );
        if (uRows && uRows[0]?.retailer_code) {
          retailerCode = uRows[0].retailer_code;
        }
      }

      const existing = await invoiceRepository.existsForOrderAndType(
        order.id,
        "VENDOR_REPLACEMENT_FEE"
      );
      if (existing) return existing;

      const rfSeries = `${retailerCode}_RF`;
      const seq = await invoiceRepository.getNextSequence(rfSeries, financialYear);
      const rfNumber = `${retailerCode}-${financialYear}/RF-${String(seq).padStart(4, "0")}`;

      const feeAmount = 30.0;
      const taxable = Math.round((feeAmount / 1.18) * 100) / 100;
      const gst = Math.round((feeAmount - taxable) * 100) / 100;
      const cgst = Math.round((gst / 2) * 100) / 100;
      const sgst = Math.round((gst - cgst) * 100) / 100;

      return await invoiceRepository.createInvoice({
        invoice_number: rfNumber,
        invoice_type: "VENDOR_REPLACEMENT_FEE",
        order_id: order.id,
        retailer_id: retailerId,
        customer_id: customerId,
        financial_year: financialYear,
        city_code: cityCode,
        taxable_amount: taxable,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: 0.0,
        total_amount: feeAmount,
        metadata: {
          fee_type: "vendor_replacement_charge",
          sac_code: "9983",
        },
        issued_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error in generateReplacementInvoice:", error);
      throw error;
    }
  }

  /**
   * Ensures that all required tax invoices and fee receipts exist in the database for an order.
   * Auto-generates any missing seller invoices, delivery receipts, or platform receipts.
   *
   * @param {string} orderId
   * @returns {Promise<Array<Object>>} All invoices for the order
   */
  async function ensureOrderInvoices(orderId) {
    try {
      const order = await orderRepository.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      const allOrderItems = await executeSupabaseQuery((supabase) =>
        supabase.from("order_items").select("*").eq("order_id", orderId)
      );

      const items = allOrderItems && allOrderItems.length > 0 ? allOrderItems : (order.items || []);

      if (items.length > 0) {
        for (const item of items) {
          await generateInvoicesOnDelivery(orderId, item.id).catch((err) => {
            logger.warn(`ensureOrderInvoices: error generating invoice for item ${item.id}:`, err.message);
          });
        }
      }

      return await invoiceRepository.findByOrderId(orderId);
    } catch (error) {
      logger.error("Error in ensureOrderInvoices:", error);
      throw error;
    }
  }

  /**
   * Prepares the complete normalized PDF data object for a single invoice or fee receipt record.
   *
   * @param {Object} invoice
   * @param {Object} order
   * @param {Object} customer
   * @returns {Promise<Object>}
   */
  async function prepareInvoicePdfData(invoice, order, customer) {
    let issuer = {
      name: "BUKIZZ STORE",
      legalName: "GARVIT RETAIL LIMITED",
      pan: "DLGPG8407M",
      gstin: "19AAJCC8517E1ZI",
      addressLines: ["Geeta Nagar", "Noble Enclave", "Gurugram"],
      state: "Haryana",
      email: "support@bukizz.in",
    };

    if (invoice.invoice_type === "SELLER_TAX_INVOICE" && invoice.retailer_id) {
      try {
        const rdRows = await executeSupabaseQuery((supabase) =>
          supabase
            .from("retailer_data")
            .select("display_name, owner_name, gstin, pan")
            .eq("retailer_id", invoice.retailer_id)
            .limit(1)
        );
        const rd = rdRows && rdRows.length > 0 ? rdRows[0] : null;

        const displayName = rd?.display_name || invoice.retailer?.full_name || "GARVIT RETAIL LIMITED";
        const ownerName = rd?.owner_name || displayName;

        issuer = {
          name: displayName,
          legalName: ownerName,
          pan: rd?.pan || "DLGPG8407M",
          gstin: rd?.gstin || "19AAJCC8517E1ZI",
          addressLines: ["D-37", "Noble Enclave", "Gurugram"],
          state: "Haryana",
          email: "support@bukizz.in",
        };
      } catch (err) {
        logger.warn("Could not fetch retailer_data for invoice PDF:", err.message);
      }
    }

    let items = [];

    if (invoice.invoice_type === "SELLER_TAX_INVOICE" && invoice.order_item_id) {
      let dedicatedComponents = [];
      try {
        dedicatedComponents = await orderItemComponentRepository.getByOrderItemId(invoice.order_item_id);
      } catch (cErr) {
        logger.warn("Could not query order_item_components in prepareInvoicePdfData:", cErr.message);
      }

      if (dedicatedComponents && dedicatedComponents.length > 0) {
        items = dedicatedComponents.map((c, idx) => {
          const qty = Number(c.quantity || 1);
          const base = Number(c.base_price || 0);
          const tax =
            Number(c.cgst_amount || 0) +
            Number(c.sgst_amount || 0) +
            Number(c.igst_amount || 0);
          const total = Number(c.total_price || base + tax);

          return {
            sl: idx + 1,
            title: c.component_title || "Kit Component Item",
            subtitle: null,
            hsn: c.hsn_sac_code || "4901",
            quantity: qty,
            taxableValue: base,
            gstRate: Number(c.gst_rate || 0),
            cgstAmount: Number(c.cgst_amount || 0),
            sgstAmount: Number(c.sgst_amount || 0),
            igstAmount: Number(c.igst_amount || 0),
            taxAmount: tax,
            totalAmount: total,
          };
        });
      } else {
        let targetItem = null;
        let childComponents = [];

        try {
          const itemRows = await executeSupabaseQuery((supabase) =>
            supabase
              .from("order_items")
              .select("*")
              .or(`id.eq.${invoice.order_item_id},parent_item_id.eq.${invoice.order_item_id}`)
          );

          targetItem = (itemRows || []).find((i) => i.id === invoice.order_item_id);
          childComponents = (itemRows || []).filter(
            (i) => i.parent_item_id === invoice.order_item_id
          );
        } catch (err) {
          logger.warn("Could not fetch order_items for invoice PDF:", err.message);
        }

        if (childComponents.length > 0) {
          items = childComponents.map((c, idx) => {
            const qty = Number(c.quantity || 1);
            const base = Number(c.base_price || 0) * qty;
            const tax =
              Number(c.cgst_amount || 0) +
              Number(c.sgst_amount || 0) +
              Number(c.igst_amount || 0);
            const total = Number(c.total_price || base + tax);

            return {
              sl: idx + 1,
              title: c.title || "Kit Component Item",
              subtitle: c.product_snapshot?.class ? `Class ${c.product_snapshot.class}` : null,
              hsn: c.product_snapshot?.hsn || "4901",
              quantity: qty,
              taxableValue: base,
              gstRate: Number(c.gst_rate || 0),
              taxAmount: tax,
              totalAmount: total,
            };
          });
        } else if (targetItem) {
          const qty = Number(targetItem.quantity || 1);
          const tax =
            Number(invoice.cgst_amount || 0) +
            Number(invoice.sgst_amount || 0) +
            Number(invoice.igst_amount || 0);

          let itemTitle = targetItem.title || "Milton Water Bottle | Shalom Hills | Class 8th";
          let itemSubtitle = null;
          if (itemTitle.includes(" | Class ")) {
            const parts = itemTitle.split(" | Class ");
            itemTitle = `${parts[0]} |`;
            itemSubtitle = `Class ${parts[1]}`;
          } else if (targetItem.product_snapshot?.class) {
            itemSubtitle = `Class ${targetItem.product_snapshot.class}`;
          }

          items = [
            {
              sl: 1,
              title: itemTitle,
              subtitle: itemSubtitle,
              hsn: targetItem.product_snapshot?.hsn || "4901",
              quantity: qty,
              taxableValue: Number(invoice.taxable_amount || targetItem.total_price || 0),
              gstRate: Number(targetItem.gst_rate || 0),
              cgstAmount: Number(invoice.cgst_amount || 0),
              sgstAmount: Number(invoice.sgst_amount || 0),
              taxAmount: tax,
              totalAmount: Number(invoice.total_amount || targetItem.total_price || 0),
            },
          ];
        }
      }
    } else if (invoice.invoice_type === "BUKIZZ_PLATFORM_RECEIPT") {
      const isIntraState = Number(invoice.cgst_amount || 0) > 0 || Number(invoice.sgst_amount || 0) > 0;
      items = [
        {
          sl: 1,
          title: "Marketplace / Platform Convenience Fee",
          subtitle: null,
          hsn: "9983",
          quantity: 1,
          taxableValue: Number(invoice.taxable_amount || 0),
          gstRate: 18.0,
          cgstAmount: Number(invoice.cgst_amount || 0),
          sgstAmount: Number(invoice.sgst_amount || 0),
          igstAmount: Number(invoice.igst_amount || 0),
          taxSplit: isIntraState
            ? {
                rate: "9%",
                cgst: Number(invoice.cgst_amount || 0).toFixed(2),
                sgst: Number(invoice.sgst_amount || 0).toFixed(2),
              }
            : null,
          taxAmount: Number(invoice.cgst_amount || 0) + Number(invoice.sgst_amount || 0) + Number(invoice.igst_amount || 0),
          totalAmount: Number(invoice.total_amount || 0),
        },
      ];
    } else if (invoice.invoice_type === "BUKIZZ_DELIVERY_RECEIPT") {
      const isIntraState = Number(invoice.cgst_amount || 0) > 0 || Number(invoice.sgst_amount || 0) > 0;
      items = [
        {
          sl: 1,
          title: "Delivery Charges",
          subtitle: null,
          hsn: "9968",
          quantity: 1,
          taxableValue: Number(invoice.taxable_amount || 0),
          gstRate: 18.0,
          cgstAmount: Number(invoice.cgst_amount || 0),
          sgstAmount: Number(invoice.sgst_amount || 0),
          igstAmount: Number(invoice.igst_amount || 0),
          taxSplit: isIntraState
            ? {
                rate: "9%",
                cgst: Number(invoice.cgst_amount || 0).toFixed(2),
                sgst: Number(invoice.sgst_amount || 0).toFixed(2),
              }
            : null,
          taxAmount: Number(invoice.cgst_amount || 0) + Number(invoice.sgst_amount || 0) + Number(invoice.igst_amount || 0),
          totalAmount: Number(invoice.total_amount || 0),
        },
      ];
    } else if (invoice.invoice_type === "BUKIZZ_INSTANT_REFUND") {
      items = [
        {
          sl: 1,
          title: "Instant Refund Processing Fee",
          subtitle: null,
          hsn: "9983",
          quantity: 1,
          taxableValue: Number(invoice.taxable_amount || 0),
          gstRate: 18.0,
          taxAmount: Number(invoice.cgst_amount || 0) + Number(invoice.sgst_amount || 0) + Number(invoice.igst_amount || 0),
          totalAmount: Number(invoice.total_amount || 0),
        },
      ];
    } else {
      items = [
        {
          sl: 1,
          title: invoice.metadata?.description || "Fee Charge",
          subtitle: null,
          hsn: "9983",
          quantity: 1,
          taxableValue: Number(invoice.taxable_amount || 0),
          gstRate: 18.0,
          taxAmount: Number(invoice.cgst_amount || 0) + Number(invoice.sgst_amount || 0) + Number(invoice.igst_amount || 0),
          totalAmount: Number(invoice.total_amount || 0),
        },
      ];
    }

    return {
      invoice,
      order: order || {},
      issuer,
      customer,
      items,
      summary: {
        taxableBase: Number(invoice.taxable_amount || 0),
        cgst: Number(invoice.cgst_amount || 0),
        sgst: Number(invoice.sgst_amount || 0),
        igst: Number(invoice.igst_amount || 0),
        grandTotal: Number(invoice.total_amount || 0),
      },
    };
  }

  /**
   * Fetches an invoice, validates authorization, structures line items,
   * and streams the compiled PDF in-memory. By default merges all user-facing
   * invoices for the order (seller tax invoice, delivery receipt, platform receipt)
   * into a single multi-page PDF document.
   *
   * @param {string} targetIdentifier - invoiceId or orderId
   * @param {string} requestingUserId - ID of user making request
   * @param {Object} [options]
   * @param {boolean} [options.mergeOrderInvoices=true] - Whether to merge all order invoices into one single multi-page PDF
   * @returns {Promise<ReadableStream>}
   */
  async function streamInvoicePdf(targetIdentifier, requestingUserId, { mergeOrderInvoices = true } = {}) {
    try {
      // 1. Resolve invoice and order
      let invoice = await invoiceRepository.findById(targetIdentifier);
      let orderId = invoice ? (invoice.order_id || invoice.order?.id) : targetIdentifier;

      if (!invoice) {
        // Try looking up first invoice of order if targetIdentifier was orderId
        const orderInvs = await invoiceRepository.findByOrderId(orderId);
        if (orderInvs && orderInvs.length > 0) {
          invoice = orderInvs[0];
        }
      }

      if (!orderId) {
        const err = new Error("Invoice or order not found");
        err.statusCode = 404;
        throw err;
      }

      const order = invoice?.order || (await orderRepository.findById(orderId));
      if (!order) {
        const err = new Error("Order not found");
        err.statusCode = 404;
        throw err;
      }

      // 2. Validate authorization
      const orderUserId = order.user_id || order.userId;
      let isAuthorized =
        !requestingUserId ||
        (invoice && invoice.customer_id === requestingUserId) ||
        (invoice && invoice.retailer_id === requestingUserId) ||
        orderUserId === requestingUserId;

      if (!isAuthorized && requestingUserId) {
        const uRows = await executeSupabaseQuery((supabase) =>
          supabase.from("users").select("role").eq("id", requestingUserId).limit(1)
        );
        if (uRows && uRows[0]?.role === "admin") {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        const err = new Error("Unauthorized to access this invoice");
        err.statusCode = 403;
        throw err;
      }

      // 3. Ensure all invoices (seller tax invoice, delivery receipt, platform receipt) exist in DB
      await ensureOrderInvoices(orderId);

      // 4. Resolve Customer info
      const sa = order.shippingAddress || order.shipping_address || {};
      const ba = order.billingAddress || order.billing_address || sa;
      const customerName =
        sa.recipientName ||
        sa.recipient_name ||
        sa.studentName ||
        sa.student_name ||
        sa.fullName ||
        ba.recipientName ||
        ba.recipient_name ||
        "Customer";

      const billingLines = [
        ba.line1,
        ba.line2,
        `${ba.city ? ba.city + ", " : ""}${ba.state || "Haryana"} - ${ba.postalCode || ba.pincode || "122001"}`,
      ].filter(Boolean);

      const shippingLines = [
        sa.line1,
        sa.line2,
        `${sa.city ? sa.city + ", " : ""}${sa.state || "Haryana"} - ${sa.postalCode || sa.pincode || "122001"}`,
      ].filter(Boolean);

      const customer = {
        name: customerName,
        billingLines: billingLines.length > 0 ? billingLines : [
          "House Number 371, Ground Floor, Housing",
          "Board Colony, Sector - 39, Gurugram,",
          "Haryana - 122001",
        ],
        shippingLines: shippingLines.length > 0 ? shippingLines : [
          "House Number 371, Ground Floor, Housing",
          "Board Colony, Sector - 39, Gurugram, Haryana -",
          "122001",
        ],
        state: sa.state || ba.state || "Haryana",
        placeOfSupply: (sa.state || ba.state || "HARYANA").toUpperCase(),
        placeOfDelivery: (sa.state || ba.state || "HARYANA").toUpperCase(),
        postalCode: sa.postalCode || sa.pincode || ba.postalCode || ba.pincode || "122001",
        phone: sa.phone || ba.phone || order.contact_phone || order.contactPhone,
      };

      const normalizedOrder = {
        ...order,
        order_number: order.order_number || order.orderNumber || "XXX",
        created_at: order.created_at || order.createdAt || new Date(),
      };

      if (!mergeOrderInvoices && invoice) {
        const singleData = await prepareInvoicePdfData(invoice, normalizedOrder, customer);
        return buildInvoicePdfStream(singleData);
      }

      // 5. Gather all customer-facing invoices for the order to merge into a single multi-page PDF
      const allInvoices = await invoiceRepository.findByOrderId(orderId);
      const customerInvoices = (allInvoices || []).filter((inv) =>
        [
          "SELLER_TAX_INVOICE",
          "BUKIZZ_DELIVERY_RECEIPT",
          "BUKIZZ_PLATFORM_RECEIPT",
          "BUKIZZ_INSTANT_REFUND",
        ].includes(inv.invoice_type)
      );

      // Sort order: SELLER_TAX_INVOICE (Page 1) -> BUKIZZ_DELIVERY_RECEIPT (Page 2) -> BUKIZZ_PLATFORM_RECEIPT (Page 3)
      const typeRank = {
        SELLER_TAX_INVOICE: 1,
        BUKIZZ_DELIVERY_RECEIPT: 2,
        BUKIZZ_PLATFORM_RECEIPT: 3,
        BUKIZZ_INSTANT_REFUND: 4,
      };
      customerInvoices.sort((a, b) => (typeRank[a.invoice_type] || 99) - (typeRank[b.invoice_type] || 99));

      const invoicesPdfDataArray = [];
      for (const inv of customerInvoices) {
        const pdfData = await prepareInvoicePdfData(inv, normalizedOrder, customer);
        invoicesPdfDataArray.push(pdfData);
      }

      if (invoicesPdfDataArray.length === 0 && invoice) {
        invoicesPdfDataArray.push(await prepareInvoicePdfData(invoice, normalizedOrder, customer));
      }

      // 6. Generate single multi-page merged PDF stream
      return buildInvoicePdfStream(invoicesPdfDataArray);
    } catch (error) {
      logger.error("Error in streamInvoicePdf:", error);
      throw error;
    }
  }

  return {
    extractCleanOrderNumber,
    generateInvoicesOnDelivery,
    ensureOrderInvoices,
    generateCancellationInvoices,
    generateReplacementInvoice,
    streamInvoicePdf,
  };
}

export const invoiceService = createInvoiceService();
