import fs from "fs";
import path from "path";
import { getGstFinancialYear } from "../src/services/invoiceService.js";
import { invoiceRepository } from "../src/repositories/invoiceRepository.js";
import { buildInvoicePdfStream } from "../src/utils/pdfInvoiceGenerator.js";

async function run() {
  console.log("=== STEP 1: Testing getGstFinancialYear ===");
  const testDates = [
    { date: "2026-03-31T00:00:00Z", expected: "26" },
    { date: "2026-04-01T00:00:00Z", expected: "27" },
    { date: "2026-09-26T00:00:00Z", expected: "27" },
    { date: "2027-01-15T00:00:00Z", expected: "27" },
    { date: "2027-03-31T00:00:00Z", expected: "27" },
    { date: "2027-04-01T00:00:00Z", expected: "28" },
  ];

  let fyAllPassed = true;
  for (const { date, expected } of testDates) {
    const fy = getGstFinancialYear(new Date(date));
    const pass = fy === expected;
    console.log(`Date: ${date} -> FY: ${fy} (Expected: ${expected}) : ${pass ? "PASS" : "FAIL"}`);
    if (!pass) fyAllPassed = false;
  }

  if (!fyAllPassed) {
    throw new Error("Financial year calculation test failed!");
  }

  console.log("\n=== STEP 2: Testing Sequence Generation & Rule 46(b) Character Limits ===");
  const fy = getGstFinancialYear();

  const testSeries = [
    { code: "FAI", pad: 6, prefix: (fy, s) => `FAI-${fy}/${s}`, type: "SELLER_TAX_INVOICE" },
    { code: "CNB_DF", pad: 5, prefix: (fy, s) => `CNB-${fy}/DF-${s}`, type: "BUKIZZ_DELIVERY_RECEIPT" },
    { code: "CNB_PF", pad: 5, prefix: (fy, s) => `CNB-${fy}/PF-${s}`, type: "BUKIZZ_PLATFORM_RECEIPT" },
    { code: "CNB_IR", pad: 4, prefix: (fy, s) => `CNB-${fy}/IR-${s}`, type: "BUKIZZ_INSTANT_REFUND" },
    { code: "FAI_CF", pad: 4, prefix: (fy, s) => `FAI-${fy}/CF-${s}`, type: "VENDOR_CANCELLATION_FEE" },
    { code: "FAI_RF", pad: 4, prefix: (fy, s) => `FAI-${fy}/RF-${s}`, type: "VENDOR_REPLACEMENT_FEE" },
  ];

  for (const item of testSeries) {
    const seq = await invoiceRepository.getNextSequence(item.code, fy);
    const padded = String(seq).padStart(item.pad, "0");
    const invoiceNumber = item.prefix(fy, padded);
    const len = invoiceNumber.length;
    const rule46bValid = len <= 16 && /^[a-zA-Z0-9\/-]+$/.test(invoiceNumber);

    console.log(
      `Series: ${item.code.padEnd(8)} -> NextSeq: ${seq} -> Formatted: ${invoiceNumber.padEnd(17)} -> Length: ${len} (<=16: ${len <= 16}) -> Valid Rule 46(b): ${rule46bValid}`
    );

    if (!rule46bValid) {
      throw new Error(`Rule 46(b) violation for series ${item.code}: ${invoiceNumber}`);
    }
  }

  console.log("\n=== STEP 3: Generating Sample Multi-Page PDF with Sequential Numbers ===");
  const sellerSeq = await invoiceRepository.getNextSequence("FAI", fy);
  const dfSeq = await invoiceRepository.getNextSequence("CNB_DF", fy);
  const pfSeq = await invoiceRepository.getNextSequence("CNB_PF", fy);

  const mockDocuments = [
    {
      invoice: {
        invoice_number: `FAI-${fy}/${String(sellerSeq).padStart(6, "0")}`,
        invoice_type: "SELLER_TAX_INVOICE",
        issued_at: new Date().toISOString(),
        taxable_amount: 508.47,
        cgst_amount: 45.76,
        sgst_amount: 45.76,
        igst_amount: 0,
        total_amount: 600.0,
      },
      order: {
        id: "test-order-seq-001",
        order_number: "BKZ-ORD-2026-9481",
        created_at: new Date().toISOString(),
        payment_method: "ONLINE",
        payment_status: "PAID",
      },
      issuer: {
        name: "BUKIZZ STORE",
        legalName: "GARVIT RETAIL LIMITED",
        pan: "DLGPG8407M",
        gstin: "19AAJCC8517E1ZI",
        addressLines: ["Geeta Nagar", "Noble Enclave", "Gurugram"],
        state: "Haryana",
        email: "support@bukizz.in",
      },
      customer: {
        name: "John Doe",
        phone: "+91 98765 43210",
        address: "Flat 402, Sunshine Heights, Civil Lines, Kanpur, Uttar Pradesh - 208001",
      },
      shippingAddress: {
        name: "John Doe",
        phone: "+91 98765 43210",
        addressLine1: "Flat 402, Sunshine Heights",
        addressLine2: "Civil Lines",
        city: "Kanpur",
        state: "Uttar Pradesh",
        pincode: "208001",
      },
      items: [
        {
          sl: 1,
          description: "Grade 5 Comprehensive Bookset (CBSE Curriculum 2026-27)",
          hsn: "4901",
          qty: 1,
          rate: 508.47,
          taxable: 508.47,
          cgstRate: 9,
          cgstAmount: 45.76,
          sgstRate: 9,
          sgstAmount: 45.76,
          igstRate: 0,
          igstAmount: 0,
          totalAmount: 600.0,
        },
      ],
      totalQty: 1,
      taxBreakdown: [
        {
          hsn: "4901",
          taxable: 508.47,
          cgstRate: 9,
          cgstAmount: 45.76,
          sgstRate: 9,
          sgstAmount: 45.76,
          igstRate: 0,
          igstAmount: 0,
          totalTax: 91.53,
        },
      ],
    },
    {
      invoice: {
        invoice_number: `CNB-${fy}/DF-${String(dfSeq).padStart(5, "0")}`,
        invoice_type: "BUKIZZ_DELIVERY_RECEIPT",
        issued_at: new Date().toISOString(),
        taxable_amount: 42.37,
        cgst_amount: 3.81,
        sgst_amount: 3.81,
        igst_amount: 0,
        total_amount: 50.0,
      },
      order: {
        id: "test-order-seq-001",
        order_number: "BKZ-ORD-2026-9481",
        created_at: new Date().toISOString(),
        payment_method: "ONLINE",
        payment_status: "PAID",
      },
      issuer: {
        name: "BUKIZZ PLATFORM SERVICES",
        legalName: "BUKIZZ PVT LTD",
        pan: "AABCB1234F",
        gstin: "09AABCB1234F1Z5",
        addressLines: ["Corporate Hub", "Mall Road", "Kanpur"],
        state: "Uttar Pradesh",
        email: "support@bukizz.in",
      },
      customer: {
        name: "John Doe",
        phone: "+91 98765 43210",
        address: "Flat 402, Sunshine Heights, Civil Lines, Kanpur, Uttar Pradesh - 208001",
      },
      shippingAddress: {
        name: "John Doe",
        phone: "+91 98765 43210",
        addressLine1: "Flat 402, Sunshine Heights",
        addressLine2: "Civil Lines",
        city: "Kanpur",
        state: "Uttar Pradesh",
        pincode: "208001",
      },
      items: [
        {
          sl: 1,
          description: "Delivery and Fulfillment Services",
          sac: "9968",
          qty: 1,
          rate: 42.37,
          taxable: 42.37,
          cgstRate: 9,
          cgstAmount: 3.81,
          sgstRate: 9,
          sgstAmount: 3.81,
          igstRate: 0,
          igstAmount: 0,
          totalAmount: 50.0,
        },
      ],
      totalQty: 1,
      taxBreakdown: [
        {
          sac: "9968",
          taxable: 42.37,
          cgstRate: 9,
          cgstAmount: 3.81,
          sgstRate: 9,
          sgstAmount: 3.81,
          igstRate: 0,
          igstAmount: 0,
          totalTax: 7.62,
        },
      ],
    },
    {
      invoice: {
        invoice_number: `CNB-${fy}/PF-${String(pfSeq).padStart(5, "0")}`,
        invoice_type: "BUKIZZ_PLATFORM_RECEIPT",
        issued_at: new Date().toISOString(),
        taxable_amount: 8.47,
        cgst_amount: 0.76,
        sgst_amount: 0.76,
        igst_amount: 0,
        total_amount: 10.0,
      },
      order: {
        id: "test-order-seq-001",
        order_number: "BKZ-ORD-2026-9481",
        created_at: new Date().toISOString(),
        payment_method: "ONLINE",
        payment_status: "PAID",
      },
      issuer: {
        name: "BUKIZZ PLATFORM SERVICES",
        legalName: "BUKIZZ PVT LTD",
        pan: "AABCB1234F",
        gstin: "09AABCB1234F1Z5",
        addressLines: ["Corporate Hub", "Mall Road", "Kanpur"],
        state: "Uttar Pradesh",
        email: "support@bukizz.in",
      },
      customer: {
        name: "John Doe",
        phone: "+91 98765 43210",
        address: "Flat 402, Sunshine Heights, Civil Lines, Kanpur, Uttar Pradesh - 208001",
      },
      shippingAddress: {
        name: "John Doe",
        phone: "+91 98765 43210",
        addressLine1: "Flat 402, Sunshine Heights",
        addressLine2: "Civil Lines",
        city: "Kanpur",
        state: "Uttar Pradesh",
        pincode: "208001",
      },
      items: [
        {
          sl: 1,
          description: "Platform Convenience Fee",
          sac: "9983",
          qty: 1,
          rate: 8.47,
          taxable: 8.47,
          cgstRate: 9,
          cgstAmount: 0.76,
          sgstRate: 9,
          sgstAmount: 0.76,
          igstRate: 0,
          igstAmount: 0,
          totalAmount: 10.0,
        },
      ],
      totalQty: 1,
      taxBreakdown: [
        {
          sac: "9983",
          taxable: 8.47,
          cgstRate: 9,
          cgstAmount: 0.76,
          sgstRate: 9,
          sgstAmount: 0.76,
          igstRate: 0,
          igstAmount: 0,
          totalTax: 1.52,
        },
      ],
    },
  ];

  const stream = buildInvoicePdfStream(mockDocuments);
  const outPath = path.resolve(
    "/Users/shivamvarshney/.gemini/antigravity-ide/brain/4c4d9b21-2cae-49fe-bcfd-8e3ca01f87cb/scratch/sequential_invoice_test.pdf"
  );
  const writeStream = fs.createWriteStream(outPath);
  stream.pipe(writeStream);

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  console.log(`Generated sequential PDF at: ${outPath}`);
  console.log("Invoice Numbers in PDF:");
  console.log("  Page 1 (Seller):", mockDocuments[0].invoice.invoice_number);
  console.log("  Page 2 (Delivery):", mockDocuments[1].invoice.invoice_number);
  console.log("  Page 3 (Platform):", mockDocuments[2].invoice.invoice_number);
  console.log("SUCCESS!");
  process.exit(0);
}

run().catch((e) => {
  console.error("Test failed with error:", e);
  process.exit(1);
});
