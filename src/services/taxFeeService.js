import { feeConfigRepository as defaultFeeConfigRepo } from "../repositories/feeConfigRepository.js";
import { closingFeeRepository as defaultClosingFeeRepo } from "../repositories/closingFeeRepository.js";
import { retailerCommissionRepository as defaultRetailerCommissionRepo } from "../repositories/retailerCommissionRepository.js";
import { variantCommissionRepository as defaultVariantCommissionRepo } from "../repositories/variantCommissionRepository.js";
import { productFeeRepository as defaultProductFeeRepo } from "../repositories/productFeeRepository.js";
import { VariantComponentRepository } from "../repositories/variantComponentRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { logger } from "../utils/logger.js";

export const BUKIZZ_OPERATING_STATE = "UTTAR PRADESH";

/**
 * Tax & Fee Calculation Service
 * Handles GST breakdown, tiered closing fees, Flipkart-style gross retailer commissions,
 * two-party fee governance (USER vs VENDOR vs ADMIN), and cancellation refund calculations.
 */
export class TaxFeeService {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.feeConfigRepository]
   * @param {Object} [deps.closingFeeRepository]
   * @param {Object} [deps.retailerCommissionRepository]
   * @param {Object} [deps.variantCommissionRepository]
   * @param {Object} [deps.productFeeRepository]
   * @param {Object} [deps.variantComponentRepository]
   * @param {Object} [deps.productRepository]
   */
  constructor(deps = {}) {
    this.feeConfigRepository =
      deps.feeConfigRepository || defaultFeeConfigRepo;
    this.closingFeeRepository =
      deps.closingFeeRepository || defaultClosingFeeRepo;
    this.retailerCommissionRepository =
      deps.retailerCommissionRepository || defaultRetailerCommissionRepo;
    this.variantCommissionRepository =
      deps.variantCommissionRepository || defaultVariantCommissionRepo;
    this.productFeeRepository =
      deps.productFeeRepository || defaultProductFeeRepo;
    this.variantComponentRepository =
      deps.variantComponentRepository || new VariantComponentRepository();
    this.productRepository =
      deps.productRepository || new ProductRepository();
  }

  /**
   * Calculate tax-inclusive base price, GST split (CGST+SGST vs IGST), and TCS.
   *
   * @param {number} sellingPrice - Tax-inclusive unit or total selling price.
   * @param {number} gstRate - Tax rate percentage (e.g. 0.00, 5.00, 12.00, 18.00).
   * @param {string} [vendorState] - State of vendor/warehouse.
   * @param {string} [customerState] - State of delivery customer.
   * @returns {Object} Tax breakdown details.
   */
  calculateProductTaxBreakdown(sellingPrice, gstRate, vendorState, customerState) {
    const sp = Number(sellingPrice || 0);
    const rate = Number(gstRate || 0);

    // Reverse taxable base: basePrice = Math.round((sellingPrice / (1 + (gstRate / 100))) * 100) / 100
    const basePrice =
      rate > 0
        ? Math.round((sp / (1 + rate / 100)) * 100) / 100
        : sp;

    // Total GST: totalGst = Math.round((sellingPrice - basePrice) * 100) / 100
    const totalGst = Math.round((sp - basePrice) * 100) / 100;

    // Normalize states for comparison
    const vState = String(vendorState || BUKIZZ_OPERATING_STATE).trim().toUpperCase();
    const cState = String(customerState || BUKIZZ_OPERATING_STATE).trim().toUpperCase();
    const isIntraState = Boolean(vState && cState && vState === cState);

    let cgst = 0.0;
    let sgst = 0.0;
    let igst = 0.0;

    // If vendorState === customerState (Intra-state): cgst = totalGst / 2, sgst = totalGst - cgst, igst = 0
    // Else (Inter-state): igst = totalGst, cgst = 0, sgst = 0
    if (totalGst > 0) {
      if (isIntraState) {
        cgst = Math.round((totalGst / 2) * 100) / 100;
        sgst = Math.round((totalGst - cgst) * 100) / 100;
        igst = 0.0;
      } else {
        cgst = 0.0;
        sgst = 0.0;
        igst = totalGst;
      }
    }

    // TCS (Section 52 CGST Act): 1% of Base Taxable Price (0% GST)
    const tcs = Math.round(basePrice * 0.01 * 100) / 100;

    return {
      sellingPrice: sp,
      gstRate: rate,
      basePrice,
      totalGst,
      cgst,
      sgst,
      igst,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      tcs,
      tcsAmount: tcs,
      isIntraState,
    };
  }

  /**
   * Matches unitPrice >= min_price and <= max_price. Defaults to ₹5.00 if unmatched.
   *
   * @param {number} unitPrice - Item unit selling price.
   * @param {Array<Object>} closingSlabs - Active closing fee slabs.
   * @returns {number} Applicable fee amount.
   */
  resolveTieredClosingFee(unitPrice, closingSlabs) {
    const price = Number(unitPrice || 0);
    if (!closingSlabs || !Array.isArray(closingSlabs) || closingSlabs.length === 0) {
      return 5.0;
    }

    for (const slab of closingSlabs) {
      const min = Number(slab.min_price || 0);
      const max =
        slab.max_price !== null && slab.max_price !== undefined
          ? Number(slab.max_price)
          : Infinity;

      if (price >= min && price <= max) {
        return Number(slab.fee_amount !== undefined ? slab.fee_amount : 5.0);
      }
    }

    // Defaults to ₹5.00 if unmatched
    return 5.0;
  }

  /**
   * Resolve retailer commission rate via hierarchy:
   * Level 1: Match category_id.
   * Level 2: Match product_type (where category_id IS NULL).
   * Level 3: Match global vendor rule (where both are NULL).
   * Fallback: 5% default (0.05 / 5.0).
   *
   * @param {Array<Object>} vendorRules - Commission rules for this retailer.
   * @param {string} [productType] - Product type ('bookset', 'uniform', 'stationary', 'general').
   * @param {string} [categoryId] - UUID of product category.
   * @returns {number} Commission percentage (e.g. 5.0 for 5%).
   */
  resolveRetailerCommissionRate(vendorRules, productType, categoryId) {
    if (vendorRules && Array.isArray(vendorRules) && vendorRules.length > 0) {
      const activeRules = vendorRules.filter((r) => r.is_active !== false);

      // Level 1: Match category_id
      if (categoryId) {
        const categoryRule = activeRules.find((r) => r.category_id === categoryId);
        if (categoryRule) {
          const val = Number(
            categoryRule.commission_percentage ??
              categoryRule.commissionPercentage ??
              categoryRule.commission_rate ??
              categoryRule.rate
          );
          return val > 1 ? Math.round((val / 100) * 10000) / 10000 : val;
        }
      }

      // Level 2: Match product_type (where category_id IS NULL)
      if (productType) {
        const typeRule = activeRules.find(
          (r) => r.product_type === productType && !r.category_id
        );
        if (typeRule) {
          const val = Number(
            typeRule.commission_percentage ??
              typeRule.commissionPercentage ??
              typeRule.commission_rate ??
              typeRule.rate
          );
          return val > 1 ? Math.round((val / 100) * 10000) / 10000 : val;
        }
      }

      // Level 3: Match global vendor rule (where both are NULL)
      const globalRule = activeRules.find(
        (r) => !r.category_id && !r.product_type
      );
      if (globalRule) {
        const val = Number(
          globalRule.commission_percentage ??
            globalRule.commissionPercentage ??
            globalRule.commission_rate ??
            globalRule.rate
        );
        return val > 1 ? Math.round((val / 100) * 10000) / 10000 : val;
      }
    }

    // Fallback: 5% default (0.05)
    return 0.05;
  }

  /**
   * Evaluate comprehensive order financials across all items.
   * - Evaluates product taxes and component GST splits.
   * - Resolves Flipkart-style commission: (Gross Selling Price * Commission %) + 18% GST.
   * - Resolves Closing Fee from tiered brackets + 18% GST.
   * - Resolves Vendor Platform Fee (₹10 + 18% GST), Collection Fee (₹15 + 18% GST), Shipping Fee (₹25 + 18% GST).
   * - Resolves Customer Delivery Charge (18% GST SAC 9968) and Cart Platform Fee (₹15 + 18% GST).
   * - Segregates itemFees by payer_party ('USER' vs 'VENDOR' vs 'ADMIN').
   * - Calculates vendor_net_payout and total_vendor_fees.
   *
   * @param {Array<Object>} items - Array of checkout/cart items.
   * @param {string} [customerState] - Customer delivery state.
   * @returns {Promise<Object>} Processed items and financial summary.
   */
  async evaluateOrderFinancials(items, optionsOrState = BUKIZZ_OPERATING_STATE) {
    try {
      const customerState =
        typeof optionsOrState === "string"
          ? optionsOrState
          : optionsOrState?.customerState || optionsOrState?.state || BUKIZZ_OPERATING_STATE;

      // 1. Load active fee configurations map and closing slabs
      const [feeMap, closingSlabs] = await Promise.all([
        this.feeConfigRepository.getMap(),
        this.closingFeeRepository.getAllActive(),
      ]);

      // 2. Enrich items with product/warehouse details if needed
      const enrichedItems = await Promise.all(
        (items || []).map(async (item) => {
          const enriched = { ...item };
          const prodId = item.productId || item.product_id;
          const varId = item.variantId || item.variant_id;

          if (
            prodId &&
            enriched.unitPrice === undefined &&
            enriched.unit_price === undefined &&
            enriched.price === undefined
          ) {
            try {
              const product = await this.productRepository.findById(prodId);
              if (product) {
                const variant = (product.variants || []).find(
                  (v) => v.id === varId
                );
                enriched.unitPrice = Number(
                  variant?.price ?? product.base_price ?? 0
                );
                enriched.retailerId =
                  enriched.retailerId ||
                  enriched.retailer_id ||
                  product.retailer_id ||
                  product.retailerId;
                enriched.productType =
                  enriched.productType ||
                  enriched.product_type ||
                  product.product_type;
                enriched.categoryId =
                  enriched.categoryId ||
                  enriched.category_id ||
                  product.categories?.[0]?.id;
                enriched.title = enriched.title || product.title;
                enriched.vendorState =
                  enriched.vendorState ||
                  product.warehouse?.state ||
                  product.retailer?.state ||
                  BUKIZZ_OPERATING_STATE;
                enriched.deliveryCharge =
                  enriched.deliveryCharge ??
                  product.delivery_charge ??
                  0;
              }
            } catch (err) {
              logger.warn(
                "Error enriching item in evaluateOrderFinancials:",
                err.message
              );
            }
          }
          return enriched;
        })
      );

      // 3. Batch-fetch product fees for all products in this order
      const productIds = [
        ...new Set(
          enrichedItems
            .map((it) => it.productId || it.product_id)
            .filter(Boolean)
        ),
      ];

      let productFeesMap = new Map();
      if (this.productFeeRepository && productIds.length > 0) {
        try {
          const pFees = await this.productFeeRepository.getByProductIds(productIds);
          (pFees || []).forEach((pf) => {
            const key = pf.variant_id
              ? `${pf.product_id}:${pf.variant_id}`
              : pf.product_id;
            if (!productFeesMap.has(key)) productFeesMap.set(key, []);
            productFeesMap.get(key).push(pf);
          });
        } catch (pfErr) {
          logger.warn("Error fetching product_fees in evaluateOrderFinancials:", pfErr.message);
        }
      }

      // 4. Fetch vendor rules for retailers involved in this order
      const retailerIds = [
        ...new Set(
          enrichedItems
            .map((it) => it.retailerId || it.retailer_id)
            .filter(Boolean)
        ),
      ];

      const retailerRulesMap = new Map();
      if (retailerIds.length > 0) {
        await Promise.all(
          retailerIds.map(async (retId) => {
            const rules =
              await this.retailerCommissionRepository.getByRetailerId(retId);
            retailerRulesMap.set(retId, rules);
          })
        );
      }

      // Unit standard system charges from fee_configurations
      const unitVendorPlatformFee = Number(
        feeMap.VENDOR_PLATFORM_FEE?.amount ?? feeMap.VENDOR_PLATFORM_FEE ?? 10.0
      );
      const unitVendorCollectionFee = Number(
        feeMap.VENDOR_COLLECTION_FEE?.amount ?? feeMap.VENDOR_COLLECTION_FEE ?? 15.0
      );
      const unitVendorShippingFee = Number(
        feeMap.VENDOR_SHIPPING_HANDLING?.amount ?? feeMap.VENDOR_SHIPPING_HANDLING ?? 25.0
      );

      let subtotal = 0.0;
      let totalBasePrice = 0.0;
      let totalCgst = 0.0;
      let totalSgst = 0.0;
      let totalIgst = 0.0;
      let totalTcs = 0.0;
      let totalProductDeliveryFees = 0.0;

      let totalVendorPlatformFee = 0.0;
      let totalVendorCommissionFee = 0.0;
      let totalVendorClosingFee = 0.0;
      let totalVendorCollectionFee = 0.0;
      let totalVendorShippingFee = 0.0;
      let totalVendorFeeGst = 0.0;

      const evaluatedItems = await Promise.all(
        enrichedItems.map(async (item) => {
          const quantity = Number(item.quantity || 1);
          const unitPrice = Number(
            item.unitPrice ?? item.unit_price ?? item.price ?? 0
          );
          const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
          subtotal += lineTotal;

          const prodId = item.productId || item.product_id;
          const varId = item.variantId || item.variant_id;
          const assignedFees =
            (varId && productFeesMap.get(`${prodId}:${varId}`)) ||
            productFeesMap.get(prodId) ||
            [];

          // GST rate determination: precedence given to item.gstRate, then HSN or productType defaults
          let gstRate = 0.0;
          if (item.gstRate !== undefined && item.gstRate !== null) {
            gstRate = Number(item.gstRate);
          } else if (item.gst_rate !== undefined && item.gst_rate !== null) {
            gstRate = Number(item.gst_rate);
          } else if (item.hsn_sac_code === "4820" || item.hsnSacCode === "4820") {
            gstRate = 12.0;
          } else if (item.hsn_sac_code === "4901" || item.hsnSacCode === "4901") {
            gstRate = 0.0;
          } else if (
            item.productType === "stationary" ||
            item.product_type === "stationary" ||
            item.productType === "uniform" ||
            item.product_type === "uniform"
          ) {
            gstRate = 12.0;
          }

          const vendorState =
            item.vendorState ||
            item.retailerState ||
            item.warehouseState ||
            BUKIZZ_OPERATING_STATE;

          // ─── Resolve Component Breakdown (Loose Kits vs Single Item) ───
          let itemComponents = [];
          if (Array.isArray(item.components) && item.components.length > 0) {
            itemComponents = item.components;
          } else if (varId && this.variantComponentRepository) {
            try {
              const vcRows = await this.variantComponentRepository.getByParentVariantId(varId);
              if (vcRows && vcRows.length > 0) {
                itemComponents = vcRows.map((vc, idx) => {
                  const compQty = (Number(vc.quantity) || 1) * quantity;
                  const compUnitPrice = Number(vc.unit_price || 0);
                  const compTotalPrice = Math.round(compUnitPrice * compQty * 100) / 100;
                  const compGstRate = Number(vc.gst_slabs?.rate_percentage ?? vc.gst_rate ?? 0);
                  const compHsn = vc.gst_slabs?.hsn_sac_code || vc.hsn_sac_code || "4901";

                  const compTax = this.calculateProductTaxBreakdown(
                    compUnitPrice,
                    compGstRate,
                    vendorState,
                    customerState
                  );

                  return {
                    componentTitle: vc.component_title,
                    quantity: compQty,
                    unitPrice: compUnitPrice,
                    totalPrice: compTotalPrice,
                    hsnSacCode: compHsn,
                    gstRate: compGstRate,
                    basePrice: Math.round(compTax.basePrice * compQty * 100) / 100,
                    cgstAmount: Math.round(compTax.cgstAmount * compQty * 100) / 100,
                    sgstAmount: Math.round(compTax.sgstAmount * compQty * 100) / 100,
                    igstAmount: Math.round(compTax.igstAmount * compQty * 100) / 100,
                    sortOrder: vc.sort_order ?? idx,
                  };
                });
              }
            } catch (vcErr) {
              logger.warn("Could not query variant components in evaluateOrderFinancials:", vcErr.message);
            }
          }

          let basePrice = 0.0;
          let cgstAmount = 0.0;
          let sgstAmount = 0.0;
          let igstAmount = 0.0;

          if (itemComponents.length > 0) {
            basePrice = Math.round(itemComponents.reduce((sum, c) => sum + (c.basePrice || 0), 0) * 100) / 100;
            cgstAmount = Math.round(itemComponents.reduce((sum, c) => sum + (c.cgstAmount || 0), 0) * 100) / 100;
            sgstAmount = Math.round(itemComponents.reduce((sum, c) => sum + (c.sgstAmount || 0), 0) * 100) / 100;
            igstAmount = Math.round(itemComponents.reduce((sum, c) => sum + (c.igstAmount || 0), 0) * 100) / 100;
            gstRate = basePrice > 0 ? Math.round(((cgstAmount + sgstAmount + igstAmount) / basePrice) * 10000) / 100 : 0.0;
          } else {
            // Unit tax calculation for single standalone item
            const unitTax = this.calculateProductTaxBreakdown(
              unitPrice,
              gstRate,
              vendorState,
              customerState
            );

            basePrice = Math.round(unitTax.basePrice * quantity * 100) / 100;
            cgstAmount = Math.round(unitTax.cgstAmount * quantity * 100) / 100;
            sgstAmount = Math.round(unitTax.sgstAmount * quantity * 100) / 100;
            igstAmount = Math.round(unitTax.igstAmount * quantity * 100) / 100;

            itemComponents = [{
              componentTitle: item.title || "Product Item",
              quantity,
              unitPrice,
              totalPrice: lineTotal,
              hsnSacCode: item.hsnSacCode || item.hsn_sac_code || (gstRate === 12 ? "4820" : "4901"),
              gstRate,
              basePrice,
              cgstAmount,
              sgstAmount,
              igstAmount,
              sortOrder: 0,
            }];
          }

          // Statutory TCS (Section 52 CGST Act - 1% of total basePrice)
          const vendorTcsAmount = Math.round(basePrice * 0.01 * 100) / 100;

          totalBasePrice += basePrice;
          totalCgst += cgstAmount;
          totalSgst += sgstAmount;
          totalIgst += igstAmount;
          totalTcs += vendorTcsAmount;

          const itemFees = [];

          // ─── 1. Delivery Charge (Payer: USER or as defined in product_fees) ───
          const customDeliveryFeeRule = assignedFees.find(
            (f) => f.fee_code === "DELIVERY_CHARGE"
          );
          const deliveryPayerParty = customDeliveryFeeRule?.payer_party || "USER";
          const deliveryChargePerUnit = Number(
            customDeliveryFeeRule?.amount_or_rate ??
              item.delivery_fee ??
              item.deliveryFee ??
              item.delivery_charge ??
              item.deliveryCharge ??
              0
          );
          const itemDeliveryFee =
            Math.round(deliveryChargePerUnit * quantity * 100) / 100;

          if (deliveryPayerParty === "USER") {
            totalProductDeliveryFees += itemDeliveryFee;
          }

          if (itemDeliveryFee > 0) {
            // Delivery service 18% GST (SAC 9968)
            const deliveryTaxable = Math.round((itemDeliveryFee / 1.18) * 100) / 100;
            const deliveryGst = Math.round((itemDeliveryFee - deliveryTaxable) * 100) / 100;
            const deliveryCgst = Math.round((deliveryGst / 2) * 100) / 100;
            const deliverySgst = Math.round((deliveryGst - deliveryCgst) * 100) / 100;

            itemFees.push({
              payerParty: deliveryPayerParty,
              feeCode: "DELIVERY_CHARGE",
              feeName: "Customer Delivery Charge",
              calculationType: "FLAT",
              appliedRate: deliveryChargePerUnit,
              taxableAmount: deliveryTaxable,
              gstRate: 18.00,
              hsnSacCode: "9968",
              cgstAmount: deliveryCgst,
              sgstAmount: deliverySgst,
              igstAmount: 0.0,
              totalFeeAmount: itemDeliveryFee,
            });
          }

          // ─── 2. Vendor Commission (Flipkart Model: Gross Selling Price basis) ───
          const customCommRule = assignedFees.find(
            (f) => f.fee_code === "COMMISSION"
          );
          let commissionRate = 0.05;

          if (customCommRule && customCommRule.amount_or_rate !== undefined) {
            const val = Number(customCommRule.amount_or_rate);
            commissionRate = val > 1 ? val / 100 : val;
          } else {
            const retId = item.retailerId || item.retailer_id;
            const vendorRules = retId ? retailerRulesMap.get(retId) || [] : [];
            commissionRate = this.resolveRetailerCommissionRate(
              vendorRules,
              item.productType || item.product_type,
              item.categoryId || item.category_id
            );

            if (this.variantCommissionRepository && varId) {
              try {
                const activeVc = await this.variantCommissionRepository.getActiveCommission(varId);
                if (activeVc && activeVc.commission_value != null) {
                  const val = Number(activeVc.commission_value);
                  commissionRate = val > 1 ? val / 100 : val;
                }
              } catch (vcErr) {
                logger.warn("Error fetching fallback variant commission in taxFeeService:", vcErr);
              }
            }
          }

          let vendorCommissionTaxable = 0.0;
          let vendorCommissionGst = 0.0;
          let vendorCommissionTotal = 0.0;

          if (commissionRate > 0) {
            // Calculated on GROSS Selling Price (Flipkart model)
            vendorCommissionTaxable = Math.round(lineTotal * commissionRate * 100) / 100;
            // 18% GST (SAC 9983)
            vendorCommissionGst = Math.round(vendorCommissionTaxable * 0.18 * 100) / 100;
            const commCgst = Math.round((vendorCommissionGst / 2) * 100) / 100;
            const commSgst = Math.round((vendorCommissionGst - commCgst) * 100) / 100;
            vendorCommissionTotal = Math.round((vendorCommissionTaxable + vendorCommissionGst) * 100) / 100;

            itemFees.push({
              payerParty: "VENDOR",
              feeCode: "COMMISSION",
              feeName: `Marketplace Referral Commission (${(commissionRate * 100).toFixed(1)}%)`,
              calculationType: "PERCENTAGE",
              appliedRate: Math.round(commissionRate * 100 * 100) / 100,
              taxableAmount: vendorCommissionTaxable,
              gstRate: 18.00,
              hsnSacCode: "9983",
              cgstAmount: commCgst,
              sgstAmount: commSgst,
              igstAmount: 0.0,
              totalFeeAmount: vendorCommissionTotal,
            });
          }

          // ─── 3. Closing Fee (Tiered) ───
          const customClosingRule = assignedFees.find(
            (f) => f.fee_code === "CLOSING_FEE"
          );
          const unitClosingFee = customClosingRule?.amount_or_rate !== undefined
            ? Number(customClosingRule.amount_or_rate)
            : this.resolveTieredClosingFee(unitPrice, closingSlabs);
          const vendorClosingTaxable = Math.round(unitClosingFee * quantity * 100) / 100;
          const vendorClosingGst = Math.round(vendorClosingTaxable * 0.18 * 100) / 100;
          const closingCgst = Math.round((vendorClosingGst / 2) * 100) / 100;
          const closingSgst = Math.round((vendorClosingGst - closingCgst) * 100) / 100;
          const vendorClosingTotal = Math.round((vendorClosingTaxable + vendorClosingGst) * 100) / 100;

          if (vendorClosingTaxable > 0) {
            itemFees.push({
              payerParty: customClosingRule?.payer_party || "VENDOR",
              feeCode: "CLOSING_FEE",
              feeName: "Price Bracket Closing Fee",
              calculationType: "TIERED",
              appliedRate: unitClosingFee,
              taxableAmount: vendorClosingTaxable,
              gstRate: 18.00,
              hsnSacCode: "9983",
              cgstAmount: closingCgst,
              sgstAmount: closingSgst,
              igstAmount: 0.0,
              totalFeeAmount: vendorClosingTotal,
            });
          }

          // ─── 4. Vendor Platform Fee (flat ₹10.00 default) ───
          const customPlatRule = assignedFees.find(
            (f) => f.fee_code === "PLATFORM_FEE" && f.payer_party === "VENDOR"
          );
          const unitPlat = customPlatRule?.amount_or_rate !== undefined
            ? Number(customPlatRule.amount_or_rate)
            : unitVendorPlatformFee;
          const vendorPlatTaxable = Math.round(unitPlat * quantity * 100) / 100;
          const vendorPlatGst = Math.round(vendorPlatTaxable * 0.18 * 100) / 100;
          const platCgst = Math.round((vendorPlatGst / 2) * 100) / 100;
          const platSgst = Math.round((vendorPlatGst - platCgst) * 100) / 100;
          const vendorPlatTotal = Math.round((vendorPlatTaxable + vendorPlatGst) * 100) / 100;

          if (vendorPlatTaxable > 0) {
            itemFees.push({
              payerParty: "VENDOR",
              feeCode: "PLATFORM_FEE",
              feeName: "Vendor Platform Service Fee",
              calculationType: "FLAT",
              appliedRate: unitPlat,
              taxableAmount: vendorPlatTaxable,
              gstRate: 18.00,
              hsnSacCode: "9983",
              cgstAmount: platCgst,
              sgstAmount: platSgst,
              igstAmount: 0.0,
              totalFeeAmount: vendorPlatTotal,
            });
          }

          // ─── 5. Vendor Collection Fee (flat ₹15.00 default) ───
          const customCollRule = assignedFees.find(
            (f) => f.fee_code === "COLLECTION_FEE"
          );
          const unitColl = customCollRule?.amount_or_rate !== undefined
            ? Number(customCollRule.amount_or_rate)
            : unitVendorCollectionFee;
          const vendorCollTaxable = Math.round(unitColl * quantity * 100) / 100;
          const vendorCollGst = Math.round(vendorCollTaxable * 0.18 * 100) / 100;
          const collCgst = Math.round((vendorCollGst / 2) * 100) / 100;
          const collSgst = Math.round((vendorCollGst - collCgst) * 100) / 100;
          const vendorCollTotal = Math.round((vendorCollTaxable + vendorCollGst) * 100) / 100;

          if (vendorCollTaxable > 0) {
            itemFees.push({
              payerParty: "VENDOR",
              feeCode: "COLLECTION_FEE",
              feeName: "Payment Gateway Collection Fee",
              calculationType: "FLAT",
              appliedRate: unitColl,
              taxableAmount: vendorCollTaxable,
              gstRate: 18.00,
              hsnSacCode: "9983",
              cgstAmount: collCgst,
              sgstAmount: collSgst,
              igstAmount: 0.0,
              totalFeeAmount: vendorCollTotal,
            });
          }

          // ─── 6. Vendor Shipping & Handling Fee (flat ₹25.00 default) ───
          const customShipRule = assignedFees.find(
            (f) => f.fee_code === "SHIPPING_FEE" && f.payer_party === "VENDOR"
          );
          const unitShip = customShipRule?.amount_or_rate !== undefined
            ? Number(customShipRule.amount_or_rate)
            : unitVendorShippingFee;
          const vendorShipTaxable = Math.round(unitShip * quantity * 100) / 100;
          const vendorShipGst = Math.round(vendorShipTaxable * 0.18 * 100) / 100;
          const shipCgst = Math.round((vendorShipGst / 2) * 100) / 100;
          const shipSgst = Math.round((vendorShipGst - shipCgst) * 100) / 100;
          const vendorShipTotal = Math.round((vendorShipTaxable + vendorShipGst) * 100) / 100;

          if (vendorShipTaxable > 0) {
            itemFees.push({
              payerParty: "VENDOR",
              feeCode: "SHIPPING_FEE",
              feeName: "Vendor Shipping and Handling Fee",
              calculationType: "FLAT",
              appliedRate: unitShip,
              taxableAmount: vendorShipTaxable,
              gstRate: 18.00,
              hsnSacCode: "9983",
              cgstAmount: shipCgst,
              sgstAmount: shipSgst,
              igstAmount: 0.0,
              totalFeeAmount: vendorShipTotal,
            });
          }

          // ─── 7. Statutory TCS (Section 52 CGST Act - 1% of base product taxable value, 0% GST) ───
          if (vendorTcsAmount > 0) {
            itemFees.push({
              payerParty: "VENDOR",
              feeCode: "TCS",
              feeName: "TCS under Section 52 CGST Act (1%)",
              calculationType: "PERCENTAGE",
              appliedRate: 1.0,
              taxableAmount: vendorTcsAmount,
              gstRate: 0.00,
              hsnSacCode: "0000",
              cgstAmount: 0.0,
              sgstAmount: 0.0,
              igstAmount: 0.0,
              totalFeeAmount: vendorTcsAmount,
            });
          }

          // Vendor deductions aggregation
          const totalVendorFees = Math.round(
            itemFees
              .filter((f) => f.payerParty === "VENDOR")
              .reduce((sum, f) => sum + (f.totalFeeAmount || 0), 0) * 100
          ) / 100;

          const vendorNetPayout = Math.round((lineTotal - totalVendorFees) * 100) / 100;

          totalVendorPlatformFee += vendorPlatTotal;
          totalVendorCommissionFee += vendorCommissionTotal;
          totalVendorClosingFee += vendorClosingTotal;
          totalVendorCollectionFee += vendorCollTotal;
          totalVendorShippingFee += vendorShipTotal;
          totalVendorFeeGst += (vendorCommissionGst + vendorClosingGst + vendorPlatGst + vendorCollGst + vendorShipGst);

          return {
            ...item,
            quantity,
            unitPrice,
            totalPrice: lineTotal,
            gstRate,
            basePrice,
            taxableAmount: basePrice,
            cgstAmount,
            sgstAmount,
            igstAmount,
            vendorPlatformFee: vendorPlatTotal,
            vendorCommissionFee: vendorCommissionTotal,
            vendorClosingFee: vendorClosingTotal,
            vendorCollectionFee: vendorCollTotal,
            vendorShippingFee: vendorShipTotal,
            vendorFeeGst: Math.round((vendorCommissionGst + vendorClosingGst + vendorPlatGst + vendorCollGst + vendorShipGst) * 100) / 100,
            vendorTcsAmount,
            commissionRate,
            deliveryFee: itemDeliveryFee,
            delivery_fee: itemDeliveryFee,
            totalVendorFees,
            vendorNetPayout,
            components: itemComponents,
            itemFees,
          };
        })
      );

      // Cart Platform Fee (USER_PLATFORM_FEE ₹15.00 + 18% GST) at cart level
      const cartPlatformFee = Number(
        feeMap.USER_PLATFORM_FEE?.amount ?? feeMap.USER_PLATFORM_FEE ?? 15.0
      );
      const cartPlatformFeeGst = Math.round(cartPlatformFee * 0.18 * 100) / 100;

      const grandTotal =
        Math.round(
          (subtotal +
            totalProductDeliveryFees +
            cartPlatformFee +
            cartPlatformFeeGst) *
            100
        ) / 100;

      return {
        items: evaluatedItems,
        summary: {
          subtotal: Math.round(subtotal * 100) / 100,
          totalBasePrice: Math.round(totalBasePrice * 100) / 100,
          totalCgst: Math.round(totalCgst * 100) / 100,
          totalSgst: Math.round(totalSgst * 100) / 100,
          totalIgst: Math.round(totalIgst * 100) / 100,
          totalGst: Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100,
          totalTcs: Math.round(totalTcs * 100) / 100,
          totalDeliveryFee: Math.round(totalProductDeliveryFees * 100) / 100,
          cartPlatformFee,
          cartPlatformFeeGst,
          totalCartPlatformFee:
            Math.round((cartPlatformFee + cartPlatformFeeGst) * 100) / 100,
          totalVendorPlatformFee:
            Math.round(totalVendorPlatformFee * 100) / 100,
          totalVendorCommissionFee:
            Math.round(totalVendorCommissionFee * 100) / 100,
          totalVendorClosingFee: Math.round(totalVendorClosingFee * 100) / 100,
          totalVendorCollectionFee:
            Math.round(totalVendorCollectionFee * 100) / 100,
          totalVendorShippingFee:
            Math.round(totalVendorShippingFee * 100) / 100,
          totalVendorFeeGst: Math.round(totalVendorFeeGst * 100) / 100,
          grandTotal,
        },
      };
    } catch (error) {
      logger.error("Error in taxFeeService.evaluateOrderFinancials:", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate refundable amount upon cancellation, retaining platform charges and OFD delivery fee.
   * Retains INSTANT_REFUND_CHARGE (flat ₹20).
   * Retains STANDARD_DELIVERY_CHARGE_OFD (flat ₹30) only if cancellationStage === 'out_for_delivery'.
   *
   * @param {Object} order - Order object containing total_amount / totalAmount.
   * @param {string} cancellationStage - Cancellation stage ('initialized', 'processed', 'shipped', 'out_for_delivery').
   * @returns {Promise<Object>} Cancellation refund breakdown.
   */
  async calculateCancellationRefund(order, cancellationStage) {
    try {
      const feeMap = await this.feeConfigRepository.getMap();

      const instantRefundCharge = Number(
        feeMap.INSTANT_REFUND_CHARGE?.amount ??
          feeMap.INSTANT_REFUND_CHARGE ??
          20.0
      );
      const ofdDeliveryCharge = Number(
        feeMap.STANDARD_DELIVERY_CHARGE_OFD?.amount ??
          feeMap.STANDARD_DELIVERY_CHARGE_OFD ??
          30.0
      );

      const orderTotal = Number(
        order.total_amount !== undefined
          ? order.total_amount
          : order.totalAmount !== undefined
          ? order.totalAmount
          : 0
      );

      // Retain INSTANT_REFUND_CHARGE
      const instantRefundFee = instantRefundCharge;

      // Retain STANDARD_DELIVERY_CHARGE_OFD only if cancellationStage === 'out_for_delivery'
      const cancellationRetainedDeliveryFee =
        cancellationStage === "out_for_delivery" ? ofdDeliveryCharge : 0.0;

      const totalDeductions =
        Math.round((instantRefundFee + cancellationRetainedDeliveryFee) * 100) /
        100;

      const refundAmount = Math.max(
        0,
        Math.round((orderTotal - totalDeductions) * 100) / 100
      );

      return {
        orderId: order.id,
        totalAmount: orderTotal,
        instantRefundFee,
        cancellationRetainedDeliveryFee,
        totalDeductions,
        refundAmount,
        cancellationStage,
      };
    } catch (error) {
      logger.error("Error in taxFeeService.calculateCancellationRefund:", {
        orderId: order?.id,
        cancellationStage,
        error: error.message,
      });
      throw error;
    }
  }
}

/**
 * Factory function for TaxFeeService
 * @param {Object} [deps]
 * @returns {TaxFeeService}
 */
export function createTaxFeeService(deps = {}) {
  return new TaxFeeService(deps);
}

export const taxFeeService = new TaxFeeService();
export default taxFeeService;
