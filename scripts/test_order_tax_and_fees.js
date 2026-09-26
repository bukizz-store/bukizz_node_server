import { TaxFeeService, BUKIZZ_OPERATING_STATE } from "../src/services/taxFeeService.js";
import { orderItemComponentRepository } from "../src/repositories/orderItemComponentRepository.js";
import { orderItemFeeRepository } from "../src/repositories/orderItemFeeRepository.js";
import { productFeeRepository } from "../src/repositories/productFeeRepository.js";

async function runTests() {
  console.log("=================================================");
  console.log("VERIFICATION: Dynamic N-Component GST & Fee Engine");
  console.log("=================================================");

  // Mock product fee repo
  const mockProductFeeRepo = {
    async getByProductIds() {
      return [
        {
          product_id: "11111111-1111-1111-1111-111111111111",
          variant_id: "33333333-3333-3333-3333-333333333333",
          fee_code: "DELIVERY_CHARGE",
          payer_party: "USER",
          calculation_type: "FLAT",
          amount_or_rate: 50.0,
          gst_rate: 18.0,
          hsn_sac_code: "9968",
        },
        {
          product_id: "11111111-1111-1111-1111-111111111111",
          variant_id: "33333333-3333-3333-3333-333333333333",
          fee_code: "COMMISSION",
          payer_party: "VENDOR",
          calculation_type: "PERCENTAGE",
          amount_or_rate: 5.0, // 5%
          gst_rate: 18.0,
          hsn_sac_code: "9983",
        },
      ];
    },
  };

  // Mock retailer commission repo
  const mockRetailerCommissionRepo = {
    async getByRetailerId() {
      return [];
    },
  };

  // Mock variant component repo
  const mockVariantComponentRepo = {
    async getByParentVariantId(variantId) {
      if (variantId === "33333333-3333-3333-3333-333333333333") {
        return [
          {
            component_title: "Class 10 Textbooks",
            quantity: 1,
            unit_price: 800.0,
            gst_rate: 0.0,
            hsn_sac_code: "4901",
            sort_order: 1,
          },
          {
            component_title: "Class 10 Notebooks Bundle",
            quantity: 1,
            unit_price: 300.0,
            gst_rate: 12.0,
            hsn_sac_code: "4820",
            sort_order: 2,
          },
          {
            component_title: "Stationery Essentials Kit",
            quantity: 1,
            unit_price: 100.0,
            gst_rate: 18.0,
            hsn_sac_code: "9608",
            sort_order: 3,
          },
        ];
      }
      return [];
    },
  };

  const taxFeeService = new TaxFeeService({
    variantComponentRepository: mockVariantComponentRepo,
    productFeeRepository: mockProductFeeRepo,
    retailerCommissionRepository: mockRetailerCommissionRepo,
  });

  // Test item: 1 Kit @ ₹1200 gross selling price
  const testItems = [
    {
      productId: "11111111-1111-1111-1111-111111111111",
      variantId: "33333333-3333-3333-3333-333333333333",
      quantity: 1,
      unitPrice: 1200.0,
      title: "Class 10 Complete Kit",
      retailerId: "22222222-2222-2222-2222-222222222222",
      productType: "bookset",
    },
  ];

  console.log("\n1. Evaluating Order Financials for N-Component Kit...");
  const result = await taxFeeService.evaluateOrderFinancials(testItems, {
    customerState: "UTTAR PRADESH",
  });

  const evaluatedItem = result.items[0];

  console.log(`- Subtotal: ₹${result.summary.subtotal}`);
  console.log(`- Total Base Price: ₹${result.summary.totalBasePrice}`);
  console.log(`- Total GST: ₹${result.summary.totalGst}`);
  console.log(`- Item Components Count: ${evaluatedItem.components.length}`);

  // Verify Components
  if (evaluatedItem.components.length !== 3) {
    throw new Error(`Expected 3 components, got ${evaluatedItem.components.length}`);
  }

  const c1 = evaluatedItem.components[0];
  const c2 = evaluatedItem.components[1];
  const c3 = evaluatedItem.components[2];

  console.log(`  ✓ Component 1: "${c1.componentTitle}" HSN:${c1.hsnSacCode} GST:${c1.gstRate}% Base:₹${c1.basePrice} CGST:₹${c1.cgstAmount} SGST:₹${c1.sgstAmount}`);
  console.log(`  ✓ Component 2: "${c2.componentTitle}" HSN:${c2.hsnSacCode} GST:${c2.gstRate}% Base:₹${c2.basePrice} CGST:₹${c2.cgstAmount} SGST:₹${c2.sgstAmount}`);
  console.log(`  ✓ Component 3: "${c3.componentTitle}" HSN:${c3.hsnSacCode} GST:${c3.gstRate}% Base:₹${c3.basePrice} CGST:₹${c3.cgstAmount} SGST:₹${c3.sgstAmount}`);

  // Verify Component 1 (0% GST): basePrice == 800
  if (c1.basePrice !== 800 || c1.cgstAmount !== 0) {
    throw new Error("Component 1 (0% GST) basePrice / CGST mismatch");
  }

  // Verify Component 2 (12% GST): 300 / 1.12 = 267.86, total GST = 32.14
  if (Math.abs(c2.basePrice - 267.86) > 0.05) {
    throw new Error(`Component 2 basePrice expected ~267.86, got ${c2.basePrice}`);
  }

  // Verify Component 3 (18% GST): 100 / 1.18 = 84.75, total GST = 15.25
  if (Math.abs(c3.basePrice - 84.75) > 0.05) {
    throw new Error(`Component 3 basePrice expected ~84.75, got ${c3.basePrice}`);
  }

  // Verify Item Fees & Flipkart-style Commission
  console.log("\n2. Verifying Item Fees & Flipkart-Style Commission Math...");
  const commFee = evaluatedItem.itemFees.find((f) => f.feeCode === "COMMISSION");
  if (!commFee) throw new Error("COMMISSION fee record missing");

  // Gross SP = 1200, Rate = 5% => Taxable Commission = 60.00
  // GST on Commission (18% SAC 9983) = 60 * 0.18 = 10.80
  // Total Commission Deducted = 70.80
  console.log(`  - Commission Taxable: ₹${commFee.taxableAmount} (Expected: ₹60.00)`);
  console.log(`  - Commission GST (18% SAC 9983): ₹${commFee.cgstAmount + commFee.sgstAmount + commFee.igstAmount} (Expected: ₹10.80)`);
  console.log(`  - Total Commission Deducted from Vendor: ₹${commFee.totalFeeAmount} (Expected: ₹70.80)`);

  if (commFee.taxableAmount !== 60.0 || commFee.totalFeeAmount !== 70.8) {
    throw new Error(`Commission math incorrect! Got ${commFee.totalFeeAmount}, expected 70.80`);
  }

  // Verify Customer Delivery Charge
  console.log("\n3. Verifying Customer Delivery Charge (18% GST SAC 9968)...");
  const delFee = evaluatedItem.itemFees.find((f) => f.feeCode === "DELIVERY_CHARGE");
  if (!delFee) throw new Error("DELIVERY_CHARGE fee record missing");
  console.log(`  - Delivery Payer Party: ${delFee.payerParty} (Expected: USER)`);
  console.log(`  - Delivery Taxable: ₹${delFee.taxableAmount} (Expected: ₹42.37)`);
  console.log(`  - Delivery GST SAC: ${delFee.hsnSacCode} (Expected: 9968)`);
  console.log(`  - Delivery Total: ₹${delFee.totalFeeAmount} (Expected: ₹50.00)`);

  if (delFee.payerParty !== "USER" || delFee.hsnSacCode !== "9968" || delFee.totalFeeAmount !== 50.0) {
    throw new Error("Delivery fee configuration incorrect!");
  }

  // Verify Payout Math
  console.log("\n4. Verifying Vendor Payout & Net Deductions...");
  console.log(`  - Total Vendor Fees Deducted: ₹${evaluatedItem.totalVendorFees}`);
  console.log(`  - Vendor Net Payout: ₹${evaluatedItem.vendorNetPayout} (lineTotal ₹${evaluatedItem.totalPrice} - fees)`);

  if (evaluatedItem.vendorNetPayout !== Math.round((evaluatedItem.totalPrice - evaluatedItem.totalVendorFees) * 100) / 100) {
    throw new Error("vendorNetPayout does not match lineTotal - totalVendorFees");
  }

  console.log("\n=================================================");
  console.log("✅ ALL TAX, FEE, AND COMPONENT TESTS PASSED!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
