import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve font and asset paths
const REGULAR_FONT_PATH = path.resolve(__dirname, "../assets/fonts/Nunito-Regular.ttf");
const BOLD_FONT_PATH = path.resolve(__dirname, "../assets/fonts/Nunito-Bold.ttf");
const BUKIZZ_LOGO_PATH = path.resolve(__dirname, "../assets/bukizz_logo.png");

/**
 * Indian State GST Dictionary
 */
const INDIAN_STATES = {
  "01": { name: "JAMMU AND KASHMIR", code: "01", abbr: "JK" },
  "02": { name: "HIMACHAL PRADESH", code: "02", abbr: "HP" },
  "03": { name: "PUNJAB", code: "03", abbr: "PB" },
  "04": { name: "CHANDIGARH", code: "04", abbr: "CH" },
  "05": { name: "UTTARAKHAND", code: "05", abbr: "UK" },
  "06": { name: "HARYANA", code: "06", abbr: "HR" },
  "07": { name: "DELHI", code: "07", abbr: "DL" },
  "08": { name: "RAJASTHAN", code: "08", abbr: "RJ" },
  "09": { name: "UTTAR PRADESH", code: "09", abbr: "UP" },
  "10": { name: "BIHAR", code: "10", abbr: "BR" },
  "11": { name: "SIKKIM", code: "11", abbr: "SK" },
  "12": { name: "ARUNACHAL PRADESH", code: "12", abbr: "AR" },
  "13": { name: "NAGALAND", code: "13", abbr: "NL" },
  "14": { name: "MANIPUR", code: "14", abbr: "MN" },
  "15": { name: "MIZORAM", code: "15", abbr: "MZ" },
  "16": { name: "TRIPURA", code: "16", abbr: "TR" },
  "17": { name: "MEGHALAYA", code: "17", abbr: "ML" },
  "18": { name: "ASSAM", code: "18", abbr: "AS" },
  "19": { name: "WEST BENGAL", code: "19", abbr: "WB" },
  "20": { name: "JHARKHAND", code: "20", abbr: "JH" },
  "21": { name: "ODISHA", code: "21", abbr: "OR" },
  "22": { name: "CHHATTISGARH", code: "22", abbr: "CT" },
  "23": { name: "MADHYA PRADESH", code: "23", abbr: "MP" },
  "24": { name: "GUJARAT", code: "24", abbr: "GJ" },
  "27": { name: "MAHARASHTRA", code: "27", abbr: "MH" },
  "29": { name: "KARNATAKA", code: "29", abbr: "KA" },
  "30": { name: "GOA", code: "30", abbr: "GA" },
  "32": { name: "KERALA", code: "32", abbr: "KL" },
  "33": { name: "TAMIL NADU", code: "33", abbr: "TN" },
  "36": { name: "TELANGANA", code: "36", abbr: "TS" },
  "37": { name: "ANDHRA PRADESH", code: "37", abbr: "AP" },
};

/**
 * Resolves State code, name, and abbreviation.
 *
 * @param {string} stateOrCode
 * @returns {{ name: string, code: string, abbr: string }}
 */
export function getStateInfo(stateOrCode = "") {
  if (!stateOrCode) return { name: "HARYANA", code: "06", abbr: "HR" };
  const trimmed = String(stateOrCode).trim();

  // If already 2-digit code
  if (/^\d{2}$/.test(trimmed) && INDIAN_STATES[trimmed]) {
    return INDIAN_STATES[trimmed];
  }

  const upper = trimmed.toUpperCase();
  for (const entry of Object.values(INDIAN_STATES)) {
    if (entry.name === upper || entry.abbr === upper) {
      return entry;
    }
  }

  // Common aliases
  if (upper.includes("HARYANA")) return INDIAN_STATES["06"];
  if (upper.includes("UTTAR PRADESH")) return INDIAN_STATES["09"];
  if (upper.includes("DELHI")) return INDIAN_STATES["07"];
  if (upper.includes("BENGAL")) return INDIAN_STATES["19"];
  if (upper.includes("MAHARASHTRA")) return INDIAN_STATES["27"];
  if (upper.includes("KARNATAKA")) return INDIAN_STATES["29"];

  return { name: upper, code: "06", abbr: "HR" };
}

/**
 * Converts a numeric amount into Indian currency words ending with "only".
 * (e.g. 449 -> "Four Hundred Forty-nine only", 118 -> "One Hundred Eighteen only")
 *
 * @param {number|string} num
 * @returns {string}
 */
export function numberToWordsIndian(num) {
  if (num === null || num === undefined || isNaN(num)) return "Zero only";
  const n = Math.round(Number(num) * 100) / 100;
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  function convertTwoDigits(val) {
    if (val < 20) return ones[val];
    const t = tens[Math.floor(val / 10)];
    const o = ones[val % 10];
    return o ? `${t}-${o.toLowerCase()}` : t;
  }

  function convertThreeDigits(val) {
    let str = "";
    if (val >= 100) {
      str += ones[Math.floor(val / 100)] + " Hundred ";
      val %= 100;
    }
    if (val > 0) {
      str += convertTwoDigits(val);
    }
    return str.trim();
  }

  if (whole === 0 && paise === 0) return "Zero only";

  let words = "";
  let rem = whole;

  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;
  const hundredAndBelow = rem;

  if (crore > 0) words += convertThreeDigits(crore) + " Crore ";
  if (lakh > 0) words += convertThreeDigits(lakh) + " Lakh ";
  if (thousand > 0) words += convertThreeDigits(thousand) + " Thousand ";
  if (hundredAndBelow > 0) words += convertThreeDigits(hundredAndBelow);

  words = words.trim();
  if (paise > 0) {
    const paiseWords = convertTwoDigits(paise);
    words = words ? `${words} and ${paiseWords} Paise only` : `${paiseWords} Paise only`;
  } else {
    words += " only";
  }

  return words;
}

/**
 * Formats a date into DD.MM.YYYY.
 *
 * @param {Date|string} dateInput
 * @returns {string}
 */
export function formatDateDots(dateInput) {
  if (!dateInput) return "14.06.2026";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Formats a date and time into DD/MM/YYYY, HH:mm:ss.
 *
 * @param {Date|string} dateInput
 * @returns {string}
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return "14/06/2026, 12:10:52";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

/**
 * Draws the Bukizz logo vector icon and wordmark using the official website logo asset.
 */
function drawBukizzLogo(doc, x, y) {
  if (fs.existsSync(BUKIZZ_LOGO_PATH)) {
    try {
      doc.image(BUKIZZ_LOGO_PATH, x, y - 4, { width: 95 });
      return;
    } catch (e) {
      // Fallback to vector drawing if image fails to load
    }
  }

  doc.save();
  // Purple back page
  doc.roundedRect(x, y + 4, 22, 27, 3).fillColor("#7E30E1").fill();
  // Sky blue front page
  doc.roundedRect(x + 7, y, 24, 25, 3).fillColor("#39A7FF").fill();
  // Bottom shadow triangle
  doc.polygon([x + 7, y + 25], [x + 15, y + 31], [x + 7, y + 31]).fillColor("#4338CA").fill();
  doc.restore();

  // "bukizz" bold wordmark
  doc.font("Main-Bold").fontSize(22).fillColor("#171A1C").text("bukizz", x + 38, y + 7, { lineBreak: false });
}

/**
 * Draws the realistic digital signature graphic inside a subtle container.
 */
function drawAuthorizedSignature(doc, x, y) {
  doc.save();
  // Container box with light background
  doc.roundedRect(x, y, 105, 26, 4).fillColor("#F3F4F6").strokeColor("#E5E7EB").lineWidth(0.5).fillAndStroke();

  // Signature curve
  doc.strokeColor("#1F2937").lineWidth(1.1).lineCap("round").lineJoin("round");
  doc.moveTo(x + 12, y + 16)
    .bezierCurveTo(x + 16, y + 6, x + 22, y + 20, x + 28, y + 10)
    .bezierCurveTo(x + 34, y + 4, x + 40, y + 20, x + 46, y + 9)
    .bezierCurveTo(x + 52, y + 7, x + 58, y + 18, x + 66, y + 8)
    .bezierCurveTo(x + 74, y + 5, x + 82, y + 15, x + 90, y + 10)
    .stroke();

  // Cursive underline flourish
  doc.moveTo(x + 18, y + 20)
    .bezierCurveTo(x + 42, y + 23, x + 70, y + 17, x + 94, y + 17)
    .bezierCurveTo(x + 85, y + 23, x + 50, y + 22, x + 28, y + 21)
    .stroke();
  doc.restore();
}

/**
 * Builds an on-the-fly PDF invoice stream using PDFKit without writing to disk.
 * Renders the exact visual specification of Bukizz Tax Invoices / Fee Receipts.
 *
 * @param {Object} invoiceData
 * @param {Object} invoiceData.invoice - Invoice metadata
 * @param {Object} [invoiceData.order] - Order metadata
 * @param {Object} [invoiceData.issuer] - Seller / Company info
 * @param {Object} [invoiceData.customer] - Customer / Recipient info
 * @param {Array<Object>} [invoiceData.items] - Line items
 * @param {Object} [invoiceData.summary] - Financial summary
 * @returns {PassThrough} Readable stream containing the generated PDF binary data.
 */
/**
 * Renders a single invoice or fee receipt page on the PDF document.
 *
 * @param {PDFDocument} doc - Active PDFKit document
 * @param {Object} invoiceData - Invoice data object
 * @param {number} pageNumber - 1-based page index
 * @param {number} totalPages - Total pages in this merged document
 */
export function renderInvoicePage(doc, invoiceData = {}, pageNumber = 1, totalPages = 1) {
  // Normalize inputs
  const invoice = invoiceData.invoice || {};
  const order = invoiceData.order || {};
  const issuer = invoiceData.issuer || {};
  const customer = invoiceData.customer || {};
  const rawItems = Array.isArray(invoiceData.items) && invoiceData.items.length > 0 ? invoiceData.items : [];
  const summary = invoiceData.summary || {};

  const isSellerInvoice = invoice.invoice_type === "SELLER_TAX_INVOICE";

  // Resolve Seller Information
  const sellerName = (issuer.name || (isSellerInvoice ? "GARVIT RETAIL LIMITED" : "BUKIZZ STORE")).toUpperCase();
  const signatoryCompany = (issuer.legalName || issuer.name || "GARVIT RETAIL LIMITED").toUpperCase();
  const sellerPan = issuer.pan || "DLGPG8407M";
  const sellerGstin = issuer.gstin || "19AAJCC8517E1ZI";

  let sellerAddressLines = Array.isArray(issuer.addressLines) && issuer.addressLines.length > 0
    ? issuer.addressLines
    : [];

  if (sellerAddressLines.length === 0) {
    if (issuer.address) {
      sellerAddressLines = issuer.address.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (isSellerInvoice) {
      sellerAddressLines = ["D-37", "Noble Enclave", "Gurugram"];
    } else {
      sellerAddressLines = ["Geeta Nagar", "Noble Enclave", "Gurugram"];
    }
  }

  // Resolve Customer & Addresses Information
  const customerDisplayName = customer.name || customer.recipientName || customer.studentName || "Garvit Goyal";
  const stateInfo = getStateInfo(customer.state || customer.stateCode || "06");
  const stateCode = stateInfo.code;
  const placeOfSupply = (customer.placeOfSupply || stateInfo.name).toUpperCase();
  const placeOfDelivery = (customer.placeOfDelivery || stateInfo.name).toUpperCase();

  let billingLines = Array.isArray(customer.billingLines) && customer.billingLines.length > 0
    ? customer.billingLines
    : [];

  if (billingLines.length === 0) {
    billingLines = [
      "House Number 371, Ground Floor, Housing",
      "Board Colony, Sector - 39, Gurugram,",
      `Haryana - ${customer.postalCode || "122001"}`,
    ];
  }

  let shippingLines = Array.isArray(customer.shippingLines) && customer.shippingLines.length > 0
    ? customer.shippingLines
    : [
        "House Number 371, Ground Floor, Housing",
        "Board Colony, Sector - 39, Gurugram, Haryana -",
        `${customer.postalCode || "122001"}`,
      ];

  // Metadata Identifiers
  const orderNumber = order.order_number || order.orderNumber || "XXX";
  const orderDate = formatDateDots(order.created_at || order.createdAt || invoice.issued_at || new Date());
  const invoiceNumber = invoice.invoice_number || (isSellerInvoice ? "GAR-27/0001" : "GGN-27/PF-0001");
  const invoiceDetails = invoice.invoice_details || `${stateInfo.abbr}/${invoiceNumber}`;
  const invoiceDate = formatDateDots(invoice.issued_at || new Date());

  // Determine Tax Structure: Intra-state (CGST + SGST) vs Inter-state (IGST)
  const isIntraState =
    Number(invoice.cgst_amount || summary.cgst || 0) > 0 ||
    Number(invoice.sgst_amount || summary.sgst || 0) > 0 ||
    (isSellerInvoice && !Number(invoice.igst_amount || summary.igst || 0));

  // Prepare Normalized Line Items
  const items = rawItems.length > 0
    ? rawItems.map((item, idx) => {
        let title = item.title || item.description || (isSellerInvoice ? "Milton Water Bottle | Shalom Hills |" : "Marketplace Fees");
        let subtitle = item.subtitle || null;
        let hsn = item.hsn || item.hsnSac || (isSellerInvoice ? "62079990" : null);

        // Parse title if contains " | Class "
        if (title.includes(" | Class ") && !subtitle) {
          const parts = title.split(" | Class ");
          title = `${parts[0]} |`;
          subtitle = `Class ${parts[1]}`;
        }

        const qty = Number(item.quantity || item.qty || 1);
        const taxable = Number(item.taxableValue !== undefined ? item.taxableValue : item.netAmount || 427.62);
        const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : taxable / qty;
        const total = item.totalAmount !== undefined ? Number(item.totalAmount) : (isSellerInvoice ? 449.00 : 118.00);

        let taxRateVal = item.gstRate !== undefined ? Number(item.gstRate) : (isIntraState ? 5.0 : 18.0);
        let taxSplit = null;

        if (item.taxSplit) {
          taxSplit = item.taxSplit;
        } else if (isIntraState) {
          const halfRate = (taxRateVal / 2).toFixed(1).replace(/\.0$/, "");
          const cgstVal = item.cgstAmount !== undefined ? Number(item.cgstAmount) : ((total - taxable) / 2);
          const sgstVal = item.sgstAmount !== undefined ? Number(item.sgstAmount) : cgstVal;
          taxSplit = {
            rate: `${halfRate}%`,
            cgst: Number(cgstVal).toFixed(2),
            sgst: Number(sgstVal).toFixed(2),
          };
        }

        const singleTaxAmount = (total - taxable).toFixed(2);

        return {
          sl: idx + 1,
          title,
          subtitle,
          hsn,
          unitPrice: unitPrice.toFixed(2),
          qty,
          netAmount: taxable.toFixed(2),
          taxSplit,
          taxRate: `${taxRateVal}%`,
          taxType: isIntraState ? "CGST/SGST" : "IGST",
          taxAmount: singleTaxAmount,
          totalAmount: total.toFixed(2),
        };
      })
    : [
        isSellerInvoice
          ? {
              sl: 1,
              title: "Milton Water Bottle | Shalom Hills |",
              subtitle: "Class 8th",
              hsn: "62079990",
              unitPrice: "427.62",
              qty: 1,
              netAmount: "427.62",
              taxSplit: { rate: "2.5%", cgst: "21.38", sgst: "21.38" },
              taxRate: "5%",
              taxType: "CGST/SGST",
              taxAmount: "42.76",
              totalAmount: "449.00",
            }
          : {
              sl: 1,
              title: "Marketplace Fees",
              subtitle: null,
              hsn: "9983",
              unitPrice: "100.00",
              qty: 1,
              netAmount: "100.00",
              taxSplit: null,
              taxRate: "18%",
              taxType: "IGST",
              taxAmount: "18.00",
              totalAmount: "118.00",
            },
      ];

  // Financial Totals
  const grandTotalNumber = items.reduce((acc, it) => acc + Number(it.totalAmount), 0);
  const grandTotalStr = grandTotalNumber.toFixed(2);

  const totalTaxStr =
    invoice.cgst_amount !== undefined && invoice.cgst_amount !== null && isIntraState
      ? Number(invoice.cgst_amount).toFixed(2)
      : isIntraState && items[0]?.taxSplit
      ? items[0].taxSplit.cgst
      : items.reduce((acc, it) => acc + Number(it.taxAmount), 0).toFixed(2);

  const amountInWords = invoice.amount_in_words || numberToWordsIndian(grandTotalNumber);

  // Payment Metadata
  const paymentTransactionId =
    order.payment_transaction_id ||
    order.transaction_id ||
    order.payment_id ||
    "QUEifsn7cVcFSn8isBcGELUruFsdoKkLUsi";
  const paymentDateTime = formatDateTime(order.payment_completed_at || order.created_at || invoice.issued_at);
  const paymentMode = (order.payment_method || "UPI").toUpperCase();

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER PAGE
  // ──────────────────────────────────────────────────────────────────────────
  doc.addPage({ size: "A4", margins: { top: 25, bottom: 20, left: 40, right: 40 } });

  // 1. Header
  drawBukizzLogo(doc, 40, 32);

  let headerTitle = "Tax Invoice/Bill of Supply/Cash Memo";
  if (invoice.invoice_type === "BUKIZZ_DELIVERY_RECEIPT") {
    headerTitle = "Tax Invoice / Delivery Charge Receipt";
  } else if (invoice.invoice_type === "BUKIZZ_PLATFORM_RECEIPT") {
    headerTitle = "Tax Invoice / Platform Fee Receipt";
  } else if (invoice.invoice_type === "BUKIZZ_INSTANT_REFUND") {
    headerTitle = "Tax Invoice / Instant Refund Processing Fee";
  } else if (invoice.invoice_type === "VENDOR_CANCELLATION_FEE") {
    headerTitle = "Tax Invoice / Vendor Cancellation Fee";
  } else if (invoice.invoice_type === "VENDOR_REPLACEMENT_FEE") {
    headerTitle = "Tax Invoice / Vendor Replacement Fee";
  }

  doc
    .font("Main-Bold")
    .fontSize(12.5)
    .fillColor("#000000")
    .text(headerTitle, 220, 35, { align: "right", width: 335, lineBreak: false });

  doc
    .font("Main")
    .fontSize(10)
    .fillColor("#000000")
    .text("(Original for Recipient)", 220, 52, { align: "right", width: 335, lineBreak: false });

  // 2. Issuer & Customer Address Blocks
  const leftX = 40;
  const rightX = 250;
  const rightW = 305;

  // Right Column: Billing Address (starts at y = 115)
  let curRightY = 115;
  doc.font("Main-Bold").fontSize(9.5).fillColor("#000000")
    .text("Billing Address :", rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 13;
  doc.font("Main-Bold").fontSize(9)
    .text(customerDisplayName, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 13;

  doc.font("Main").fontSize(8.5);
  billingLines.forEach((line) => {
    doc.text(line, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
    curRightY += 12;
  });
  doc.text("IN", rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 12;
  doc.font("Main-Bold").fontSize(8.5)
    .text(`State/UT Code: ${stateCode}`, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 16;

  // Right Column: Shipping Address
  doc.font("Main-Bold").fontSize(9.5)
    .text("Shipping Address :", rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 13;
  doc.font("Main-Bold").fontSize(9)
    .text(customerDisplayName, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 13;

  doc.font("Main").fontSize(8.5);
  shippingLines.forEach((line) => {
    doc.text(line, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
    curRightY += 12;
  });
  doc.text("IN", rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 12;

  doc.font("Main-Bold").fontSize(8.5)
    .text(`State/UT Code: ${stateCode}`, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 13;
  doc.text(`Place of supply: ${placeOfSupply}`, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 13;
  doc.text(`Place of delivery: ${placeOfDelivery}`, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 15;

  // Right Column: Invoice Metadata (baseline anchors for Order Number & Order Date)
  const invNumY = curRightY;
  doc.font("Main-Bold").fontSize(9)
    .text(`Invoice Number : ${invoiceNumber}`, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 14;
  const invDetailsY = curRightY;
  doc.text(`Invoice Details : ${invoiceDetails}`, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 14;
  doc.text(`Invoice Date : ${invoiceDate}`, rightX, curRightY, { align: "right", width: rightW, lineBreak: false });
  curRightY += 14;

  // Left Column: Sold By / Issued By (starts at y = 115)
  const soldByLabel = isSellerInvoice ? "Sold By :" : "Sold By / Issued By :";
  let curLeftY = 115;
  doc.font("Main-Bold").fontSize(9.5).fillColor("#000000")
    .text(soldByLabel, leftX, curLeftY, { lineBreak: false });
  curLeftY += 14;
  doc.font("Main-Bold").fontSize(9)
    .text(sellerName, leftX, curLeftY, { lineBreak: false });
  curLeftY += 13;

  doc.font("Main").fontSize(8.5);
  sellerAddressLines.forEach((line) => {
    doc.text(line, leftX, curLeftY, { lineBreak: false });
    curLeftY += 12;
  });

  // PAN and GST lines placed at consistent y = 268
  curLeftY = 268;
  doc.font("Main-Bold").fontSize(8.5)
    .text(`PAN No: ${sellerPan}`, leftX, curLeftY, { lineBreak: false });
  curLeftY += 13;
  doc.text(`GST Registration No: ${sellerGstin}`, leftX, curLeftY, { lineBreak: false });

  // Order Number and Order Date horizontally aligned with Invoice Number and Details
  doc.font("Main-Bold").fontSize(9)
    .text(`Order Number: ${orderNumber}`, leftX, invNumY, { lineBreak: false });
  doc.font("Main-Bold").fontSize(9)
    .text(`Order Date: ${orderDate}`, leftX, invDetailsY, { lineBreak: false });

  // 3. Itemized GST Table (Total width = 515 pt)
  const tableY = curRightY + 10;
  const tableW = 515;

  const cols = [
    { id: "sl", name: "Sl.\nNo", w: 24 },
    { id: "desc", name: "Description", w: 186 },
    { id: "unit", name: "Unit\nPrice", w: 46 },
    { id: "qty", name: "Qty", w: 22 },
    { id: "net", name: "Net\nAmount", w: 48 },
    { id: "rate", name: "Tax\nRate", w: 36 },
    { id: "type", name: "Tax\nType", w: 34 },
    { id: "tax", name: "Tax\nAmount", w: 44 },
    { id: "total", name: "Total\nAmount", w: 75 },
  ];

  // Table Header
  const headerH = 26;
  doc.rect(40, tableY, tableW, headerH).fillColor("#EDEDED").fill();
  doc.rect(40, tableY, tableW, headerH).strokeColor("#000000").lineWidth(0.5).stroke();

  let xAcc = 40;
  cols.forEach((c) => {
    doc.moveTo(xAcc, tableY).lineTo(xAcc, tableY + headerH).strokeColor("#000000").lineWidth(0.5).stroke();
    xAcc += c.w;
  });

  xAcc = 40;
  doc.font("Main-Bold").fontSize(7.5).fillColor("#000000");
  cols.forEach((c) => {
    const padTop = c.name.includes("\n") ? 4 : 8;
    doc.text(c.name, xAcc, tableY + padTop, { width: c.w, align: "center", lineBreak: false });
    xAcc += c.w;
  });

  // Render Table Body Rows
  let curRowY = tableY + headerH;

  items.forEach((item) => {
    const hasTaxSplit = item.taxSplit !== null && item.taxSplit !== undefined;

    // Calculate required height for description text
    doc.font("Main-Bold").fontSize(8);
    const titleH = doc.heightOfString(item.title || "", { width: cols[1].w - 4 });
    doc.font("Main").fontSize(7.5);
    const subH = item.subtitle ? doc.heightOfString(item.subtitle, { width: cols[1].w - 4 }) + 2 : 0;
    const hsnH = item.hsn ? 10 : 0;
    const totalDescH = titleH + subH + hsnH + 8;

    const rowH = Math.max(hasTaxSplit ? 38 : 30, Math.ceil(totalDescH));

    doc.rect(40, curRowY, tableW, rowH).strokeColor("#000000").lineWidth(0.5).stroke();

    xAcc = 40;
    cols.forEach((c) => {
      doc.moveTo(xAcc, curRowY).lineTo(xAcc, curRowY + rowH).strokeColor("#000000").lineWidth(0.5).stroke();
      xAcc += c.w;
    });

    const midY = curRowY + (rowH / 2) - 4;

    // Sl No
    doc.font("Main").fontSize(8).fillColor("#000000")
      .text(String(item.sl), 40, midY, { width: cols[0].w, align: "center", lineBreak: false });

    // Description
    doc.font("Main-Bold").fontSize(8);
    doc.text(item.title, 66, curRowY + 4, { width: cols[1].w - 4 });
    let textCursorY = curRowY + 4 + titleH + 2;
    if (item.subtitle) {
      doc.font("Main").fontSize(7.5)
        .text(item.subtitle, 66, textCursorY, { width: cols[1].w - 4 });
      textCursorY += subH;
    }
    if (item.hsn) {
      const hsnLabel = item.hsn.startsWith("99") ? "SAC:" : "HSN:";
      doc.font("Main").fontSize(7)
        .text(`${hsnLabel} ${item.hsn}`, 66, textCursorY, { width: cols[1].w - 4 });
    }

    // Unit Price
    doc.font("Main").fontSize(8)
      .text(`₹${item.unitPrice}`, 250, midY, { width: cols[2].w - 4, align: "right", lineBreak: false });

    // Qty
    doc.text(String(item.qty), 296, midY, { width: cols[3].w, align: "center", lineBreak: false });

    // Net Amount
    doc.text(`₹${item.netAmount}`, 318, midY, { width: cols[4].w - 4, align: "right", lineBreak: false });

    // Tax Rate, Tax Type, Tax Amount
    if (hasTaxSplit) {
      const splitY = curRowY + (rowH / 2) - 9;
      doc.font("Main").fontSize(7.5)
        .text(`${item.taxSplit.rate}\n${item.taxSplit.rate}`, 366, splitY, { width: cols[5].w, align: "center" });
      doc.text("CGST\nSGST", 402, splitY, { width: cols[6].w, align: "center" });
      doc.text(`₹${item.taxSplit.cgst}\n₹${item.taxSplit.sgst}`, 436, splitY, { width: cols[7].w - 4, align: "right" });
    } else {
      doc.font("Main").fontSize(7.5)
        .text(item.taxRate, 366, midY, { width: cols[5].w, align: "center", lineBreak: false });
      doc.text(item.taxType, 402, midY, { width: cols[6].w, align: "center", lineBreak: false });
      doc.text(`₹${item.taxAmount}`, 436, midY, { width: cols[7].w - 4, align: "right", lineBreak: false });
    }

    // Total Amount
    doc.font("Main").fontSize(8)
      .text(`₹${item.totalAmount}`, 480, midY, { width: cols[8].w - 6, align: "right", lineBreak: false });

    curRowY += rowH;
  });

  // TOTAL Row
  const totalY = curRowY;
  const totalH = 18;
  doc.rect(40, totalY, tableW, totalH).strokeColor("#000000").lineWidth(0.5).stroke();

  doc.font("Main-Bold").fontSize(8.5).text("TOTAL:", 44, totalY + 4, { lineBreak: false });

  // Dividers before Tax Amount and Total Amount
  doc.moveTo(436, totalY).lineTo(436, totalY + totalH).strokeColor("#000000").lineWidth(0.5).stroke();
  doc.moveTo(480, totalY).lineTo(480, totalY + totalH).strokeColor("#000000").lineWidth(0.5).stroke();

  // Tax Amount sum
  doc.font("Main").fontSize(8).text(`₹${totalTaxStr}`, 436, totalY + 4, { width: cols[7].w - 4, align: "right", lineBreak: false });
  // Grand Total
  doc.font("Main-Bold").fontSize(8).text(`₹${grandTotalStr}`, 480, totalY + 4, { width: cols[8].w - 6, align: "right", lineBreak: false });

  // 4. Amount in Words & Authorized Signatory Box
  const boxY = totalY + totalH;
  const boxH = 68;

  doc.rect(40, boxY, tableW, boxH).strokeColor("#000000").lineWidth(0.5).stroke();
  doc.moveTo(345, boxY).lineTo(345, boxY + boxH).strokeColor("#000000").lineWidth(0.5).stroke();

  // Left: Amount in Words
  doc.font("Main-Bold").fontSize(9.5).text("Amount in Words:", 44, boxY + 6, { lineBreak: false });
  doc.font("Main-Bold").fontSize(10.5).text(amountInWords, 44, boxY + 22, { width: 295, lineBreak: false });

  // Right: Signature Block
  doc.font("Main-Bold").fontSize(9).text(`For ${signatoryCompany}:`, 345, boxY + 6, { width: 210, align: "center", lineBreak: false });
  drawAuthorizedSignature(doc, 397, boxY + 19);
  doc.font("Main-Bold").fontSize(9.5).text("Authorized Signatory", 345, boxY + 50, { width: 210, align: "center", lineBreak: false });

  // 5. Reverse Charge Clause
  const rcY = boxY + boxH + 8;
  doc.font("Main").fontSize(9).fillColor("#000000").text("Whether tax is payable under reverse charge - No", 40, rcY, { lineBreak: false });

  // 6. Payment Details 4-Column Box
  const payY = rcY + 15;
  const payH = 32;
  const pCols = [
    { name: "Payment Transaction ID:", val: paymentTransactionId, w: 195 },
    { name: `Date & Time: ${paymentDateTime}`, val: "hrs", w: 145 },
    { name: "Invoice Value:", val: grandTotalStr, w: 70 },
    { name: "Mode of Payment:", val: paymentMode, w: 105 },
  ];

  doc.rect(40, payY, tableW, payH).strokeColor("#000000").lineWidth(0.5).stroke();
  let pxAcc = 40;
  pCols.forEach((pc, idx) => {
    if (idx > 0) {
      doc.moveTo(pxAcc, payY).lineTo(pxAcc, payY + payH).strokeColor("#000000").lineWidth(0.5).stroke();
    }
    doc.font("Main-Bold").fontSize(7.5).fillColor("#000000").text(pc.name, pxAcc + 4, payY + 4, { lineBreak: false });
    doc.font("Main").fontSize(7.5).fillColor("#000000").text(pc.val, pxAcc + 4, payY + 16, { width: pc.w - 8, lineBreak: false });
    pxAcc += pc.w;
  });

  // 7. Footers
  if (isSellerInvoice) {
    doc.font("Main").fontSize(6.5).fillColor("#777777")
      .text("Customers desirous of availing input GST credit are requested to create a Business account and purchase on Bukizz from Business eligible offers", 40, 785, { width: 515, align: "center", lineBreak: false });
    doc.text("Please note that this invoice is not a demand for payment", 40, 796, { width: 515, align: "center", lineBreak: false });
  } else {
    doc.font("Main").fontSize(6.5).fillColor("#777777")
      .text("Please note that this invoice is not a demand for payment", 40, 796, { width: 515, align: "center", lineBreak: false });
  }
  doc.font("Main").fontSize(7).text(`Page ${pageNumber} of ${totalPages}`, 450, 794, { width: 105, align: "right", lineBreak: false });
}

/**
 * Builds an on-the-fly PDF invoice stream using PDFKit without writing to disk.
 * Renders the exact visual specification of Bukizz Tax Invoices / Fee Receipts.
 * Can accept a single invoice data object or an array of invoice data objects to
 * seamlessly generate a single multi-page merged PDF document.
 *
 * @param {Object|Array<Object>} invoiceInput - Single invoiceData object or array of invoiceData objects
 * @returns {PassThrough} Readable stream containing the generated PDF binary data.
 */
export function buildInvoicePdfStream(invoiceInput = {}) {
  const invoices = Array.isArray(invoiceInput)
    ? (invoiceInput.length > 0 ? invoiceInput : [{}])
    : [invoiceInput || {}];

  const primaryInvoice = invoices[0]?.invoice || {};
  const doc = new PDFDocument({
    size: "A4", // 595.28 x 841.89 pt
    margins: { top: 25, bottom: 20, left: 40, right: 40 },
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `Invoice - ${primaryInvoice.invoice_number || "Specimen"}`,
      Author: "Bukizz Platform",
      Subject: "Tax Invoice / Bill of Supply / Cash Memo",
    },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  // Register fonts
  const hasRegular = fs.existsSync(REGULAR_FONT_PATH);
  const hasBold = fs.existsSync(BOLD_FONT_PATH);

  doc.registerFont("Main", hasRegular ? REGULAR_FONT_PATH : "Helvetica");
  doc.registerFont("Main-Bold", hasBold ? BOLD_FONT_PATH : "Helvetica-Bold");

  // Render each invoice as a distinct page within the single PDF document
  const totalPages = invoices.length;
  invoices.forEach((data, index) => {
    renderInvoicePage(doc, data, index + 1, totalPages);
  });

  // Finalize PDF stream
  doc.end();

  return stream;
}
