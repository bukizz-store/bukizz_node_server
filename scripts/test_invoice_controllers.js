import assert from "node:assert";
import { Readable } from "node:stream";
import { createInvoiceController } from "../src/controllers/invoiceController.js";
import { OrderController } from "../src/controllers/orderController.js";
import { DeliveryController } from "../src/controllers/deliveryController.js";

async function runTests() {
  console.log("=== Testing Invoice Controller & Integration ===");

  const validOrderId = "00000000-0000-0000-0000-000000000001";
  const validInvoiceId = "00000000-0000-0000-0000-000000000002";

  // ─────────────────────────────────────────────────────────────
  // 1. Test Invoice Controller getOrderInvoices
  // ─────────────────────────────────────────────────────────────
  console.log("\n1. Testing createInvoiceController - getOrderInvoices...");

  const mockInvoices = [
    {
      id: validInvoiceId,
      invoice_number: "FAI-27/2401",
      invoice_type: "SELLER_TAX_INVOICE",
      total_amount: 1500.0,
      issued_at: "2026-09-22T00:00:00.000Z",
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      invoice_number: "CNB-27/PF-2401",
      invoice_type: "BUKIZZ_PLATFORM_RECEIPT",
      total_amount: 19.0,
      issued_at: "2026-09-22T00:00:00.000Z",
    },
  ];

  let queriedOrderId = null;
  const mockInvoiceRepo = {
    findByOrderId: async (orderId) => {
      queriedOrderId = orderId;
      return mockInvoices;
    },
  };

  const controller = createInvoiceController({
    invoiceRepository: mockInvoiceRepo,
    invoiceService: {},
  });

  const req1 = {
    params: { orderId: validOrderId },
    user: { id: "00000000-0000-0000-0000-000000000099" },
  };

  let jsonResult = null;
  await new Promise((resolve, reject) => {
    const res1 = {
      status: (code) => res1,
      json: (data) => {
        jsonResult = data;
        resolve();
        return res1;
      },
    };
    controller.getOrderInvoices(req1, res1, reject);
  });

  assert.strictEqual(queriedOrderId, validOrderId);
  assert(Array.isArray(jsonResult), "Result must be a JSON array");
  assert.strictEqual(jsonResult.length, 2);
  assert.deepStrictEqual(jsonResult[0], {
    id: validInvoiceId,
    invoiceNumber: "FAI-27/2401",
    invoiceType: "SELLER_TAX_INVOICE",
    totalAmount: 1500.0,
    issuedAt: "2026-09-22T00:00:00.000Z",
    downloadUrl: `/api/v1/orders/${validOrderId}/invoices/${validInvoiceId}/download`,
  });
  console.log("✓ getOrderInvoices passed with correct JSON array structure and downloadUrl");

  // ─────────────────────────────────────────────────────────────
  // 2. Test Invoice Controller downloadInvoicePdf
  // ─────────────────────────────────────────────────────────────
  console.log("\n2. Testing createInvoiceController - downloadInvoicePdf...");

  let streamedInvoiceId = null;
  let streamedUserId = null;
  const mockPdfStream = new Readable({
    read() {
      this.push(Buffer.from("%PDF-1.4 test"));
      this.push(null);
    },
  });

  const mockInvoiceSvc = {
    streamInvoicePdf: async (invoiceId, userId) => {
      streamedInvoiceId = invoiceId;
      streamedUserId = userId;
      return mockPdfStream;
    },
  };

  const controller2 = createInvoiceController({
    invoiceRepository: mockInvoiceRepo,
    invoiceService: mockInvoiceSvc,
  });

  const req2 = {
    params: { orderId: validOrderId, invoiceId: validInvoiceId },
    user: { id: "00000000-0000-0000-0000-000000000099" },
  };

  const headersSet = {};
  let piped = false;

  await new Promise((resolve, reject) => {
    const res2 = {
      setHeader: (key, val) => {
        headersSet[key] = val;
      },
      write: (chunk) => {},
      end: () => {},
      on: () => {},
      once: () => {},
      emit: () => {},
    };

    mockPdfStream.pipe = (dest) => {
      piped = true;
      resolve();
      return dest;
    };

    controller2.downloadInvoicePdf(req2, res2, reject);
  });

  assert.strictEqual(streamedInvoiceId, validInvoiceId);
  assert.strictEqual(streamedUserId, "00000000-0000-0000-0000-000000000099");
  assert.strictEqual(headersSet["Content-Type"], "application/pdf");
  assert.strictEqual(
    headersSet["Content-Disposition"],
    `inline; filename="Invoice-${validInvoiceId}.pdf"`
  );
  assert.strictEqual(piped, true, "PDF stream must be piped to response");
  console.log("✓ downloadInvoicePdf passed with headers and stream pipe");

  // ─────────────────────────────────────────────────────────────
  // 3. Test OrderController getOrder attaching invoices
  // ─────────────────────────────────────────────────────────────
  console.log("\n3. Testing OrderController getOrder & getOrderTracking invoice attachment...");

  const mockOrderService = {
    getOrder: async (orderId, userId) => ({
      id: orderId,
      orderNumber: "ORD-2026-0001",
      userId,
      items: [],
      totalAmount: 1519.0,
      events: [],
    }),
  };

  const orderCtrl = new OrderController(mockOrderService, mockInvoiceRepo);

  const reqOrder = {
    params: { orderId: validOrderId },
    user: { id: "00000000-0000-0000-0000-000000000099", role: "customer" },
  };

  let orderResponseData = null;
  await new Promise((resolve, reject) => {
    const resOrder = {
      json: (payload) => {
        orderResponseData = payload;
        resolve();
      },
    };
    orderCtrl.getOrder(reqOrder, resOrder, reject);
  });

  assert(orderResponseData?.data?.order, "Order response must contain order");
  assert(
    Array.isArray(orderResponseData.data.order.invoices),
    "Order object must contain invoices array"
  );
  assert.strictEqual(orderResponseData.data.order.invoices.length, 2);
  console.log("✓ OrderController getOrder appends invoices array successfully");

  // Test getOrderTracking
  let trackingResponseData = null;
  await new Promise((resolve, reject) => {
    const resTracking = {
      json: (payload) => {
        trackingResponseData = payload;
        resolve();
      },
    };
    orderCtrl.getOrderTracking(reqOrder, resTracking, reject);
  });

  assert(trackingResponseData?.data, "Tracking response must contain data");
  assert(
    Array.isArray(trackingResponseData.data.invoices),
    "Tracking data must contain invoices array"
  );
  assert.strictEqual(trackingResponseData.data.invoices.length, 2);
  console.log("✓ OrderController getOrderTracking appends invoices array successfully");

  // ─────────────────────────────────────────────────────────────
  // 4. Test DeliveryController invoiceService injection
  // ─────────────────────────────────────────────────────────────
  console.log("\n4. Testing DeliveryController invoiceService injection...");

  let deliveryInvoicedOrder = null;
  let deliveryInvoicedItem = null;
  const mockDeliveryInvoiceService = {
    generateInvoicesOnDelivery: async (orderId, itemId) => {
      deliveryInvoicedOrder = orderId;
      deliveryInvoicedItem = itemId;
    },
  };

  const deliveryCtrl = new DeliveryController({
    invoiceService: mockDeliveryInvoiceService,
  });

  assert.strictEqual(deliveryCtrl.invoiceService, mockDeliveryInvoiceService);
  console.log("✓ DeliveryController correctly stores injected invoiceService");

  console.log("\n=== ALL INVOICE CONTROLLER TESTS PASSED SUCCESSFULLY! ===");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
