import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import warehouseRepository from "../repositories/warehouseRepository.js";
import { logger } from "../utils/logger.js";
import { dpBankDetailsSchema } from "../models/schemas.js";

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export class DeliveryController {
  /**
   * @param {Object} deps - Injected dependencies
   * @param {Object} deps.deliveryIncentiveService
   * @param {Object} deps.deliveryBankService
   */
  constructor(deps = {}) {
    this.deliveryIncentiveService = deps.deliveryIncentiveService || null;
    this.deliveryBankService = deps.deliveryBankService || null;
  }

  /**
   * Get all warehouses that have shipped orders, with order counts
   * GET /api/v1/delivery/warehouses-with-shipped-orders
   */
  getShippedWarehouses = asyncHandler(async (req, res) => {
    logger.info("Fetching warehouses with shipped orders", {
      userId: req.user?.id,
    });

    const token = req.headers.authorization?.split(' ')[1];
    
    // Fetch the list of warehouses using the warehouse repository
    const warehouses = await warehouseRepository.getWarehousesWithShippedOrders(token);

    res.json({
      success: true,
      data: warehouses,
      message: "Warehouses with shipped orders retrieved successfully",
    });
  });

  /**
   * Get all available shipped items for a specific warehouse
   * Handles soft-locking filter (available work for delivery partners)
   * GET /api/v1/delivery/warehouses/:warehouseId/orders
   */
  getWarehouseOrders = asyncHandler(async (req, res) => {
    const { warehouseId } = req.params;
    const partnerId = req.user?.id;
    
    if (!warehouseId) {
      return res.status(400).json({
        success: false,
        message: "Warehouse ID is required",
      });
    }

    logger.info("Fetching available items for warehouse", {
      partnerId,
      warehouseId
    });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());
    const { search, sortBy } = req.query;

    // Switch to getAvailableWarehouseItems which returns items + soft-lock logic
    const items = await orderRepository.getAvailableWarehouseItems(warehouseId, partnerId, {
      status: "shipped",
      limit: 100,
      search,
      sortBy
    });

    // Enrich items with estimated delivery incentive
    if (this.deliveryIncentiveService && items.length > 0) {
      try {
        // Resolve warehouse address for distance calculation
        const { getSupabase: getSb } = await import("../db/index.js");
        const sb = getSb();
        const { data: warehouseData } = await sb
          .from("warehouse")
          .select("address")
          .eq("id", warehouseId)
          .single();

        let warehouseAddress = null;
        if (warehouseData?.address && typeof warehouseData.address === "string") {
          const { data: addr } = await sb
            .from("addresses")
            .select("*")
            .eq("id", warehouseData.address)
            .single();
          warehouseAddress = addr;
        }

        if (warehouseAddress) {
          await Promise.all(
            items.map(async (item) => {
              try {
                const shipping = item.orderInfo?.shippingAddress || {};
                const { distanceKm, estimatedIncentive } =
                  await this.deliveryIncentiveService.estimateIncentive(
                    warehouseAddress,
                    shipping
                  );
                item.estimatedDistanceKm = distanceKm;
                item.estimatedIncentive = estimatedIncentive;
              } catch {
                item.estimatedDistanceKm = null;
                item.estimatedIncentive = null;
              }
            })
          );
        }
      } catch (err) {
        logger.warn("Failed to compute delivery incentives for warehouse items", {
          warehouseId,
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      data: items,
      message: "Available warehouse items retrieved successfully",
    });
  });

  /**
   * Claim multiple items for a delivery partner (Soft Lock)
   * POST /api/v1/delivery/warehouses/:warehouseId/claim
   */
  claimItems = asyncHandler(async (req, res) => {
    const { warehouseId } = req.params;
    const { itemIds } = req.body;
    const partnerId = req.user?.id;

    if (!warehouseId || !itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Warehouse ID and non-empty list of Item IDs are required",
      });
    }

    if (itemIds.length > 10) {
      return res.status(400).json({
        success: false,
        message: "You can claim a maximum of 10 items at a time",
      });
    }

    logger.info("Claiming items for warehouse", {
      partnerId,
      warehouseId,
      itemCount: itemIds.length
    });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    // Enforce 10-item limit GLOBALLY (existing locks + new claims)
    const existingLockCount = await orderRepository.countValidLocks(partnerId);
    const totalRequested = existingLockCount + itemIds.length;

    if (totalRequested > 10) {
      return res.status(400).json({
        success: false,
        message: `You already have ${existingLockCount} active locks. You can claim at most ${10 - existingLockCount} more items.`,
      });
    }

    const claimedItems = await orderRepository.claimItems(itemIds, partnerId);

    if (claimedItems.length === 0) {
      return res.status(409).json({
        success: false,
        message: "No items could be claimed. They may have been claimed by someone else or your existing locks have expired.",
      });
    }

    res.json({
      success: true,
      data: claimedItems,
      message: `Successfully claimed ${claimedItems.length} items. Total active locks: ${existingLockCount + claimedItems.length}`,
    });
  });

  /**
   * Confirm pickup after QR scan — transitions item from shipped → out_for_delivery
   * POST /api/v1/delivery/confirm-pickup
   * Body: { orderItemId, orderId }
   */
  confirmPickup = asyncHandler(async (req, res) => {
    const { orderItemId, orderId } = req.body;
    const partnerId = req.user?.id;

    if (!orderItemId || !orderId) {
      return res.status(400).json({
        success: false,
        message: "orderItemId and orderId are required",
      });
    }

    logger.info("Confirming pickup via QR scan", {
      partnerId,
      orderItemId,
      orderId,
    });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    // Verify lock & update status to out_for_delivery
    const updatedItem = await orderRepository.confirmPickupItem(
      orderItemId,
      orderId,
      partnerId,
    );

    // Record order event for audit trail
    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const orderEventRepository = new OrderEventRepository(getSupabase());
    await orderEventRepository.create({
      orderId,
      orderItemId,
      previousStatus: "shipped",
      newStatus: "out_for_delivery",
      changedBy: partnerId,
      note: "Package scanned at warehouse pickup",
      metadata: { delivery_partner_id: partnerId },
    });

    res.json({
      success: true,
      data: updatedItem,
      message: "Pickup confirmed. Item is now out for delivery.",
    });
  });

  // Simple in-memory cache for warehouse arrival OTPs
  // Format: { 'warehouseId_partnerId': { otp: '123456', expiresAt: timestamp } }
  static warehouseArrivalOTPCache = {};
  // Simple in-memory cache for delivery completion OTPs
  // Format: { 'itemId_partnerId': { otp: '123456', expiresAt: timestamp } }
  static deliveryCompletionOTPCache = {};
  // Temporary verification cache to allow delivery completion after OTP verify.
  // Format: { 'itemId_partnerId': { expiresAt: timestamp } }
  static deliveryOtpVerifiedCache = {};
  // OTP cache for RTO customer-refused verification.
  // Format: { 'itemId_partnerId': { otp: '123456', expiresAt: timestamp } }
  static rtoCustomerRefusedOTPCache = {};
  // Verification cache for RTO customer-refused OTP.
  // Format: { 'itemId_partnerId': { expiresAt: timestamp } }
  static rtoCustomerRefusedVerifiedCache = {};
  // OTP cache for RTO dropoff confirmation.
  // Format: { 'returnId_partnerId': { otp: '123456', expiresAt: timestamp } }
  static rtoDropoffOTPCache = {};
  // Verification cache for RTO dropoff OTP.
  // Format: { 'returnId_partnerId': { expiresAt: timestamp } }
  static rtoDropoffVerifiedCache = {};

  /**
   * Send OTP to retailer email for warehouse arrival verification
   * POST /api/v1/delivery/warehouses/:warehouseId/arrival-otp
   */
  sendWarehouseArrivalOTP = asyncHandler(async (req, res) => {
    const { warehouseId } = req.params;
    const partnerId = req.user?.id;

    if (!warehouseId) {
      return res.status(400).json({ success: false, message: "Warehouse ID is required" });
    }

    logger.info("Generating warehouse arrival OTP", { partnerId, warehouseId });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    // Fetch warehouse first
    const { data: warehouse, error: fetchError } = await supabase
      .from("warehouse")
      .select("id, name")
      .eq("id", warehouseId)
      .single();

    if (fetchError) {
      logger.error("Failed to fetch warehouse", { warehouseId, error: fetchError.message });
      return res.status(500).json({ success: false, message: "Failed to fetch warehouse" });
    }

    if (!warehouse) {
      return res.status(404).json({ success: false, message: "Warehouse not found" });
    }

    // Resolve linked retailer from mapping table
    const { data: retailerLink, error: linkError } = await supabase
      .from("retailer_warehouse")
      .select("retailer_id")
      .eq("warehouse_id", warehouseId)
      .limit(1)
      .maybeSingle();

    if (linkError) {
      logger.error("Failed to fetch warehouse-retailer link", { warehouseId, error: linkError.message });
      return res.status(500).json({ success: false, message: "Failed to resolve retailer for warehouse" });
    }

    if (!retailerLink?.retailer_id) {
      return res.status(400).json({ success: false, message: "Warehouse is not linked to any retailer" });
    }

    // Get retailer email
    const { data: retailer, error: retailerError } = await supabase
      .from("users")
      .select("email, full_name")
      .eq("id", retailerLink.retailer_id)
      .single();

    if (retailerError || !retailer || !retailer.email) {
      return res.status(400).json({ success: false, message: "Could not find retailer email to send OTP" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in memory (expires in 10 minutes)
    const cacheKey = `${warehouseId}_${partnerId}`;
    DeliveryController.warehouseArrivalOTPCache[cacheKey] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    // Send email using existing template
    const { emailService } = await import("../services/emailService.js");
    await emailService.sendOtpEmail(retailer.email, otp);

    res.json({
      success: true,
      data: {
        expiresInSeconds: 600,
        maskedEmail: retailer.email.replace(/(.{2})(.*)(?=@)/,
          (gp1, gp2, gp3) => {
            for(let i = 0; i < gp3.length; i++) {
              gp2+= "*";
            } return gp2;
          }
        )
      },
      message: "OTP sent successfully to retailer",
    });
  });

  /**
   * Verify warehouse arrival OTP
   * POST /api/v1/delivery/warehouses/:warehouseId/verify-arrival-otp
   */
  verifyWarehouseArrivalOTP = asyncHandler(async (req, res) => {
    const { warehouseId } = req.params;
    const { otp } = req.body;
    const partnerId = req.user?.id;

    if (!warehouseId || !otp) {
      return res.status(400).json({ success: false, message: "Warehouse ID and OTP are required" });
    }

    logger.info("Verifying warehouse arrival OTP", { partnerId, warehouseId });

    const cacheKey = `${warehouseId}_${partnerId}`;
    const cachedData = DeliveryController.warehouseArrivalOTPCache[cacheKey];

    if (!cachedData) {
      return res.status(400).json({ success: false, message: "OTP not found or expired. Please request a new one." });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete DeliveryController.warehouseArrivalOTPCache[cacheKey];
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }

    if (cachedData.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // OTP verified successfully, remove from cache
    delete DeliveryController.warehouseArrivalOTPCache[cacheKey];

    res.json({
      success: true,
      message: "OTP verified successfully. Arrival confirmed.",
    });
  });

  _completeDeliveryForItem = async ({
    itemId,
    partnerId,
    paymentCollected = false,
    paymentCollectionMethod = null,
  }) => {
    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    const { formatted: updatedItem, orderId } = await orderRepository.markItemDelivered(
      itemId,
      partnerId,
      {
        markPaymentPaid: !!paymentCollected,
        paymentCollectionMethod,
      }
    );

    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const orderEventRepository = new OrderEventRepository(getSupabase());
    await orderEventRepository.create({
      orderId,
      orderItemId: itemId,
      previousStatus: "out_for_delivery",
      newStatus: "delivered",
      changedBy: partnerId,
      note: "Package delivered by delivery partner",
      metadata: { delivery_partner_id: partnerId },
    });

    let incentiveData = null;
    if (this.deliveryIncentiveService && orderId) {
      try {
        const supabase = getSupabase();
        const { data: orderData } = await supabase
          .from("orders")
          .select("shipping_address, warehouse_id")
          .eq("id", orderId)
          .single();

        if (orderData?.warehouse_id) {
          const { data: warehouseData } = await supabase
            .from("warehouse")
            .select("address")
            .eq("id", orderData.warehouse_id)
            .single();

          let warehouseAddress = null;
          if (warehouseData?.address && typeof warehouseData.address === "string") {
            const { data: addr } = await supabase
              .from("addresses")
              .select("*")
              .eq("id", warehouseData.address)
              .single();
            warehouseAddress = addr;
          }

          if (warehouseAddress) {
            incentiveData = await this.deliveryIncentiveService.finalizeIncentive(
              {
                orderId,
                dpUserId: partnerId,
                warehouseAddress,
                shippingAddress: orderData.shipping_address,
              },
              supabase
            );
          }
        }
      } catch (err) {
        logger.error("Failed to finalize delivery incentive", {
          orderId,
          partnerId,
          error: err.message,
        });
      }
    }

    return {
      ...updatedItem,
      ...(incentiveData && {
        deliveryDistanceKm: incentiveData.distanceKm,
        deliveryIncentiveAmount: incentiveData.incentiveAmount,
      }),
    };
  };

  /**
   * Send OTP to customer email for delivery completion fallback.
   * POST /api/v1/delivery/items/:itemId/delivery-otp
   */
  sendDeliveryOtp = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const partnerId = req.user?.id;

    if (!itemId) {
      return res.status(400).json({ success: false, message: "Item ID is required" });
    }

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    const { data: item, error: itemError } = await supabase
      .from("order_items")
      .select(`
        id,
        dispatch_id,
        status,
        locked_by,
        orders!inner(
          id,
          order_number,
          contact_email
        )
      `)
      .eq("id", itemId)
      .eq("status", "out_for_delivery")
      .eq("locked_by", partnerId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({
        success: false,
        message: "Item not found, not out for delivery, or not assigned to you.",
      });
    }

    const customerEmail = item.orders?.contact_email;
    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: "Customer email not found for this order.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = `${itemId}_${partnerId}`;
    DeliveryController.deliveryCompletionOTPCache[cacheKey] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    const { emailService } = await import("../services/emailService.js");
    await emailService.sendOtpEmail(
      customerEmail,
      otp,
      "customer-delivery-otp-verification",
      {
        orderNumber: item.orders?.order_number || item.orders?.id,
        dispatchId: item.dispatch_id || null,
      }
    );

    res.json({
      success: true,
      data: {
        expiresInSeconds: 600,
        maskedEmail: customerEmail.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => {
          for (let i = 0; i < gp3.length; i++) {
            gp2 += "*";
          }
          return gp2;
        }),
      },
      message: "Delivery OTP sent successfully",
    });
  });

  /**
   * Verify delivery OTP and mark item delivered.
   * POST /api/v1/delivery/items/:itemId/verify-delivery-otp
   */
  verifyDeliveryOtp = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { otp, paymentCollected, paymentCollectionMethod, completeDelivery = true } = req.body || {};
    const partnerId = req.user?.id;

    if (!itemId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Item ID and OTP are required",
      });
    }

    const cacheKey = `${itemId}_${partnerId}`;
    const cachedData = DeliveryController.deliveryCompletionOTPCache[cacheKey];
    if (!cachedData) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired. Please request a new one.",
      });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete DeliveryController.deliveryCompletionOTPCache[cacheKey];
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    if (cachedData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    delete DeliveryController.deliveryCompletionOTPCache[cacheKey];
    DeliveryController.deliveryOtpVerifiedCache[cacheKey] = {
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    if (completeDelivery === false) {
      return res.json({
        success: true,
        message: "OTP verified successfully.",
      });
    }

    const data = await this._completeDeliveryForItem({
      itemId,
      partnerId,
      paymentCollected: !!paymentCollected,
      paymentCollectionMethod: paymentCollectionMethod || null,
    });
    delete DeliveryController.deliveryOtpVerifiedCache[cacheKey];

    res.json({
      success: true,
      data,
      message: "OTP verified and item marked as delivered successfully.",
    });
  });

  /**
   * Send OTP to customer email for customer-refused RTO flow.
   * POST /api/v1/delivery/items/:itemId/rto-otp
   */
  sendRtoOtp = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const partnerId = req.user?.id;

    if (!itemId) {
      return res.status(400).json({ success: false, message: "Item ID is required" });
    }

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    const { data: item, error: itemError } = await supabase
      .from("order_items")
      .select(`
        id,
        dispatch_id,
        status,
        locked_by,
        orders!inner(
          id,
          order_number,
          contact_email
        )
      `)
      .eq("id", itemId)
      .eq("status", "out_for_delivery")
      .eq("locked_by", partnerId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({
        success: false,
        message: "Item not found, not out for delivery, or not assigned to you.",
      });
    }

    const customerEmail = item.orders?.contact_email;
    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: "Customer email not found for this order.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = `${itemId}_${partnerId}`;
    DeliveryController.rtoCustomerRefusedOTPCache[cacheKey] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    const { emailService } = await import("../services/emailService.js");
    await emailService.sendOtpEmail(
      customerEmail,
      otp,
      "customer-rto-cancellation-otp-verification",
      {
        orderNumber: item.orders?.order_number || item.orders?.id,
        dispatchId: item.dispatch_id || null,
      }
    );

    res.json({
      success: true,
      data: {
        expiresInSeconds: 600,
        maskedEmail: customerEmail.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => {
          for (let i = 0; i < gp3.length; i++) {
            gp2 += "*";
          }
          return gp2;
        }),
      },
      message: "RTO OTP sent successfully",
    });
  });

  /**
   * Verify OTP for customer-refused RTO flow.
   * POST /api/v1/delivery/items/:itemId/verify-rto-otp
   */
  verifyRtoOtp = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { otp } = req.body || {};
    const partnerId = req.user?.id;

    if (!itemId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Item ID and OTP are required",
      });
    }

    const cacheKey = `${itemId}_${partnerId}`;
    const cachedData = DeliveryController.rtoCustomerRefusedOTPCache[cacheKey];
    if (!cachedData) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired. Please request a new one.",
      });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete DeliveryController.rtoCustomerRefusedOTPCache[cacheKey];
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    if (cachedData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    delete DeliveryController.rtoCustomerRefusedOTPCache[cacheKey];
    DeliveryController.rtoCustomerRefusedVerifiedCache[cacheKey] = {
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    res.json({
      success: true,
      message: "RTO OTP verified successfully.",
    });
  });

  /**
   * Send OTP to retailer email for RTO warehouse dropoff confirmation.
   * POST /api/v1/delivery/rto/:returnId/dropoff-otp
   */
  sendRtoDropoffOtp = asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const partnerId = req.user?.id;

    if (!returnId) {
      return res.status(400).json({
        success: false,
        message: "Return ID is required",
      });
    }

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    const { data: returnRecord, error: fetchError } = await supabase
      .from("order_returns")
      .select(`
        id, order_id, order_item_id, pickup_dp_id, warehouse_id, status,
        order_items!order_item_id ( id, dispatch_id ),
        orders!order_id ( order_number )
      `)
      .eq("id", returnId)
      .single();

    if (fetchError || !returnRecord) {
      return res.status(404).json({
        success: false,
        message: "Return record not found",
      });
    }

    if (returnRecord.pickup_dp_id !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this return",
      });
    }

    if (returnRecord.status !== "in_transit") {
      return res.status(400).json({
        success: false,
        message: `Cannot send OTP. Return status is "${returnRecord.status}", expected "in_transit"`,
      });
    }

    const { data: retailerLink, error: linkError } = await supabase
      .from("retailer_warehouse")
      .select("retailer_id")
      .eq("warehouse_id", returnRecord.warehouse_id)
      .limit(1)
      .maybeSingle();

    if (linkError || !retailerLink?.retailer_id) {
      return res.status(400).json({
        success: false,
        message: "Warehouse is not linked to any retailer",
      });
    }

    const { data: retailer, error: retailerError } = await supabase
      .from("users")
      .select("email")
      .eq("id", retailerLink.retailer_id)
      .single();

    if (retailerError || !retailer?.email) {
      return res.status(400).json({
        success: false,
        message: "Could not find retailer email to send OTP",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = `${returnId}_${partnerId}`;
    DeliveryController.rtoDropoffOTPCache[cacheKey] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    const { emailService } = await import("../services/emailService.js");
    await emailService.sendOtpEmail(retailer.email, otp, "retailer-rto-dropoff-otp-verification", {
      orderNumber: returnRecord.orders?.order_number || returnRecord.order_id,
      dispatchId: returnRecord.order_items?.dispatch_id || null,
    });

    res.json({
      success: true,
      data: {
        expiresInSeconds: 600,
        maskedEmail: retailer.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => {
          for (let i = 0; i < gp3.length; i++) {
            gp2 += "*";
          }
          return gp2;
        }),
      },
      message: "RTO dropoff OTP sent successfully",
    });
  });

  /**
   * Verify OTP for RTO warehouse dropoff confirmation.
   * POST /api/v1/delivery/rto/:returnId/verify-dropoff-otp
   */
  verifyRtoDropoffOtp = asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const { otp } = req.body || {};
    const partnerId = req.user?.id;

    if (!returnId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Return ID and OTP are required",
      });
    }

    const cacheKey = `${returnId}_${partnerId}`;
    const cachedData = DeliveryController.rtoDropoffOTPCache[cacheKey];
    if (!cachedData) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired. Please request a new one.",
      });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete DeliveryController.rtoDropoffOTPCache[cacheKey];
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    if (cachedData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    delete DeliveryController.rtoDropoffOTPCache[cacheKey];
    DeliveryController.rtoDropoffVerifiedCache[cacheKey] = {
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    res.json({
      success: true,
      message: "RTO dropoff OTP verified successfully.",
    });
  });

  /**
   * Mark an item as delivered
   * POST /api/v1/delivery/items/:itemId/mark-delivered
   */
  markDelivered = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const partnerId = req.user?.id;
    const { paymentCollected, paymentCollectionMethod, currentLat, currentLng } = req.body || {};

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required",
      });
    }

    logger.info("Marking item as delivered", { partnerId, itemId, paymentCollected });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();
    const { data: item, error: itemError } = await supabase
      .from("order_items")
      .select(`
        id,
        status,
        locked_by,
        orders!inner(
          id,
          shipping_address
        )
      `)
      .eq("id", itemId)
      .eq("status", "out_for_delivery")
      .eq("locked_by", partnerId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({
        success: false,
        message: "Item not found, not out for delivery, or not assigned to you.",
      });
    }

    const cacheKey = `${itemId}_${partnerId}`;
    const verifiedData = DeliveryController.deliveryOtpVerifiedCache[cacheKey];
    const hasVerifiedOtp =
      !!verifiedData && Date.now() <= verifiedData.expiresAt;

    const shippingAddress = item.orders?.shipping_address || {};
    const customerLat =
      shippingAddress?.lat ??
      shippingAddress?.coordinates?.lat ??
      null;
    const customerLng =
      shippingAddress?.lng ??
      shippingAddress?.coordinates?.lng ??
      null;

    const canCheckDistance =
      typeof currentLat === "number" &&
      typeof currentLng === "number" &&
      typeof customerLat === "number" &&
      typeof customerLng === "number";

    if (!hasVerifiedOtp && !canCheckDistance) {
      return res.status(403).json({
        success: false,
        requiresOtp: true,
        message: "Delivery OTP required to complete delivery from current location.",
      });
    }

    if (!hasVerifiedOtp) {
      const distanceMeters = calculateDistanceMeters(
        currentLat,
        currentLng,
        customerLat,
        customerLng
      );

      if (distanceMeters > 200) {
        return res.status(403).json({
          success: false,
          requiresOtp: true,
          distanceMeters: Math.round(distanceMeters),
          thresholdMeters: 200,
          message: "Delivery OTP required when you are more than 200m away.",
        });
      }
    }

    const data = await this._completeDeliveryForItem({
      itemId,
      partnerId,
      paymentCollected: !!paymentCollected,
      paymentCollectionMethod: paymentCollectionMethod || null,
    });
    delete DeliveryController.deliveryOtpVerifiedCache[cacheKey];

    res.json({
      success: true,
      data,
      message: "Item marked as delivered successfully.",
    });
  });

  /**
   * Get all active (out_for_delivery) items for the current delivery partner
   * GET /api/v1/delivery/active-deliveries
   */
  getActiveDeliveries = asyncHandler(async (req, res) => {
    const partnerId = req.user?.id;

    logger.info("Fetching active deliveries", { partnerId });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    const items = await orderRepository.getActiveDeliveries(partnerId);

    res.json({
      success: true,
      data: items,
      message: `Found ${items.length} active delivery item(s).`,
    });
  });

  /**
   * Create a Razorpay Payment Link for a COD order
   * POST /api/v1/delivery/create-payment-link
   */
  createPaymentLink = asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    const partnerId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    logger.info("Creating delivery payment link", { partnerId, orderId });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    const order = await orderRepository.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.paymentStatus === "paid") {
      return res.json({
        success: true,
        data: { alreadyPaid: true },
        message: "Order is already paid.",
      });
    }

    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const amountInPaise = Math.round(order.totalAmount * 100);
    const expireBy = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes

    const linkOptions = {
      amount: amountInPaise,
      currency: "INR",
      description: `Payment for Order #${order.orderNumber}`,
      expire_by: expireBy,
      reminder_enable: false,
      notes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveryPartnerId: partnerId,
      },
    };

    // Only include customer fields with non-empty values
    const customer = {};
    if (order.shippingAddress?.recipientName) customer.name = order.shippingAddress.recipientName;
    if (order.contactPhone) customer.contact = order.contactPhone;
    if (order.contactEmail) customer.email = order.contactEmail;
    if (Object.keys(customer).length > 0) linkOptions.customer = customer;

    const paymentLink = await razorpay.paymentLink.create(linkOptions);

    logger.info("Payment link created", {
      orderId,
      paymentLinkId: paymentLink.id,
      shortUrl: paymentLink.short_url,
    });

    res.json({
      success: true,
      data: {
        paymentLinkId: paymentLink.id,
        shortUrl: paymentLink.short_url,
        amount: order.totalAmount,
        expireBy,
      },
    });
  });

  /**
   * Get payment status for an order (used for polling)
   * Checks DB first, then falls back to Razorpay Payment Link status
   * GET /api/v1/delivery/payment-status/:orderId
   */
  getPaymentStatus = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const paymentLinkId = req.query.paymentLinkId; // optional, for direct Razorpay check

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    const { data: order, error } = await supabase
      .from("orders")
      .select("payment_status, payment_method")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    let paymentStatus = order.payment_status || "pending";

    // If DB still shows pending and we have a paymentLinkId, check Razorpay directly
    if (paymentStatus !== "paid" && paymentLinkId) {
      try {
        const Razorpay = (await import("razorpay")).default;
        const razorpay = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const link = await razorpay.paymentLink.fetch(paymentLinkId);

        if (link.status === "paid") {
          // Razorpay says paid but DB missed it — sync DB now
          paymentStatus = "paid";
          await supabase
            .from("orders")
            .update({
              payment_status: "paid",
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);

          logger.info("Payment status synced from Razorpay Payment Link", {
            orderId,
            paymentLinkId,
          });
        }
      } catch (rpErr) {
        // Non-fatal — fall back to DB status
        logger.warn("Failed to check Razorpay Payment Link status", {
          orderId,
          paymentLinkId,
          error: rpErr.message,
        });
      }
    }

    res.json({
      success: true,
      data: {
        paymentStatus,
        paymentMethod: order.payment_method,
      },
    });
  });

  /**
   * Get delivery history for the current partner (past delivered items).
   * Queries order_events where new_status='delivered' and changed_by=partnerId.
   * GET /api/v1/delivery/history?page=1&limit=20&startDate=&endDate=
   */
  getDeliveryHistory = asyncHandler(async (req, res) => {
    const partnerId = req.user?.id;
    const { page, limit, startDate, endDate } = req.query;

    logger.info("Fetching delivery history", { partnerId });

    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();
    const orderEventRepository = new OrderEventRepository(supabase);

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Build query for delivered events by this partner
    let query = supabase
      .from("order_events")
      .select(`
        id,
        order_id,
        order_item_id,
        new_status,
        created_at,
        metadata,
        orders!order_id(
          id,
          order_number,
          shipping_address,
          payment_method,
          total_amount
        ),
        order_items!order_item_id(
          id,
          title,
          quantity,
          total_price,
          dispatch_id,
          variant_id
        )
      `, { count: "exact" })
      .eq("new_status", "delivered")
      .eq("changed_by", partnerId);

    if (startDate) query = query.gte("created_at", startDate);
    if (endDate) query = query.lte("created_at", endDate);

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error("Error fetching delivery history:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch delivery history",
      });
    }

    // Also fetch weekly summary (last 7 days, grouped by day)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

    const { data: weekData } = await supabase
      .from("order_events")
      .select("created_at")
      .eq("new_status", "delivered")
      .eq("changed_by", partnerId)
      .gte("created_at", weekAgo.toISOString())
      .order("created_at", { ascending: true });

    // Group by day of week
    const dailyCounts = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    (weekData || []).forEach((ev) => {
      const day = new Date(ev.created_at).getDay(); // 0=Sun, 1=Mon...
      const idx = day === 0 ? 6 : day - 1; // Shift so Mon=0, Sun=6
      dailyCounts[idx]++;
    });

    const totalWeek = dailyCounts.reduce((a, b) => a + b, 0);

    // Fetch total earnings this week from dp_ledgers
    const { data: weekEarnings } = await supabase
      .from("dp_ledgers")
      .select("amount")
      .eq("dp_user_id", partnerId)
      .eq("transaction_type", "delivery_earning")
      .gte("created_at", weekAgo.toISOString());

    const totalEarnings = (weekEarnings || []).reduce(
      (sum, row) => sum + parseFloat(row.amount || 0),
      0
    );

    // Prepare items for variant enrichment
    const rawOrders = (data || []).map((ev) => ({
      eventId: ev.id,
      orderId: ev.order_id,
      orderItemId: ev.order_item_id,
      orderNumber: ev.orders?.order_number || '',
      dispatchId: ev.order_items?.dispatch_id || null,
      deliveredAt: ev.created_at,
      title: ev.order_items?.title || 'Unknown Item',
      quantity: ev.order_items?.quantity || 0,
      itemAmount: ev.order_items?.total_price || 0,
      orderTotalAmount: ev.orders?.total_amount || 0,
      shippingAddress: ev.orders?.shipping_address || {},
      paymentMethod: ev.orders?.payment_method || 'COD',
      variantId: ev.order_items?.variant_id || null, // Needed for enrichment
    }));

    // Enrich with variant data
    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const orderRepo = new OrderRepository(supabase);
    const enrichedOrders = await orderRepo.enrichItemsWithVariantData(rawOrders);

    // Format variant as string if requested by frontend models
    const orders = enrichedOrders.map(order => {
      if (order.variant && order.variant.options) {
        order.variantString = order.variant.options
          .map(o => `${o.attribute?.name || 'Option'}: ${o.value}`)
          .join(", ");
      }
      return order;
    });

    res.json({
      success: true,
      data: {
        orders,
        summary: {
          totalDeliveries: count || 0,
          weeklyDeliveries: totalWeek,
          weeklyEarnings: parseFloat(totalEarnings.toFixed(2)),
          dailyCounts,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limitNum),
        },
      },
      message: "Delivery history retrieved successfully",
    });
  });

  /**
   * Get delivery partner wallet balance and recent transactions
   * GET /api/v1/delivery/wallet/balance
   */
  getWalletBalance = asyncHandler(async (req, res) => {
    const partnerId = req.user?.id;
    const { page, limit } = req.query;

    if (!this.deliveryIncentiveService) {
      return res.status(503).json({
        success: false,
        message: "Wallet service is not available",
      });
    }

    logger.info("Fetching wallet balance", { partnerId });

    const wallet = await this.deliveryIncentiveService.getWallet(partnerId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });

    res.json({
      success: true,
      data: wallet,
      message: "Wallet data retrieved successfully",
    });
  });

  /**
   * Add & verify bank details for the delivery partner
   * POST /api/v1/delivery/bank-details
   */
  addBankDetails = asyncHandler(async (req, res) => {
    if (!this.deliveryBankService) {
      return res.status(503).json({
        success: false,
        message: "Bank details service is not available",
      });
    }

    // Validate request body
    const { error, value } = dpBankDetailsSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      throw new AppError(`Validation error: ${msg}`, 400);
    }

    const userId = req.user.id;

    const result = await this.deliveryBankService.verifyAndSaveBankDetails(
      userId,
      value
    );

    logger.info("DP bank details added", { userId });

    res.status(200).json({
      success: true,
      data: result,
      message: "Bank account verified and saved successfully",
    });
  });

  /**
   * Get saved bank details for the delivery partner
   * GET /api/v1/delivery/bank-details
   */
  getBankDetails = asyncHandler(async (req, res) => {
    if (!this.deliveryBankService) {
      return res.status(503).json({
        success: false,
        message: "Bank details service is not available",
      });
    }

    const userId = req.user.id;
    const result = await this.deliveryBankService.getBankDetails(userId);

    res.status(200).json({
      success: true,
      data: result,
      message: result
        ? "Bank details retrieved successfully"
        : "No bank details found",
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // RTO (Return to Origin) APIs - When delivery partner cannot deliver
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initiate RTO for an item (delivery failed)
   * POST /api/v1/delivery/items/:itemId/initiate-rto
   * Body: { reasonCode, reasonText?, proofImageUrl? }
   */
  initiateRTO = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { reasonCode, reasonText, proofImageUrl } = req.body;
    const partnerId = req.user?.id;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required",
      });
    }

    if (!reasonCode) {
      return res.status(400).json({
        success: false,
        message: "Reason code is required",
      });
    }

    const validReasonCodes = [
      "customer_unavailable",
      "address_not_found",
      "customer_refused",
      "incorrect_item",
      "unsafe_location",
      "other",
    ];

    if (!validReasonCodes.includes(reasonCode)) {
      return res.status(400).json({
        success: false,
        message: `Invalid reason code. Must be one of: ${validReasonCodes.join(", ")}`,
      });
    }

    logger.info("Initiating RTO for item", { partnerId, itemId, reasonCode });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    // Verify item exists and is out_for_delivery, locked by this partner
    const { data: item, error: itemError } = await supabase
      .from("order_items")
      .select(`
        id, order_id, status, title, quantity, warehouse_id, total_price,
        locked_by, locked_at,
        orders!order_id (
          id, order_number, user_id, shipping_address, contact_email,
          users!user_id ( full_name, email )
        )
      `)
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    if (item.status !== "out_for_delivery") {
      return res.status(400).json({
        success: false,
        message: `Cannot initiate RTO. Item status is "${item.status}", expected "out_for_delivery"`,
      });
    }

    // Verify this partner has the lock
    if (item.locked_by !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You do not have this item locked for delivery",
      });
    }

    if (reasonCode === "customer_refused") {
      const cacheKey = `${itemId}_${partnerId}`;
      const verifiedData = DeliveryController.rtoCustomerRefusedVerifiedCache[cacheKey];
      const hasVerifiedOtp =
        !!verifiedData && Date.now() <= verifiedData.expiresAt;

      if (!hasVerifiedOtp) {
        return res.status(403).json({
          success: false,
          requiresOtp: true,
          message: "OTP verification is required for customer refused RTO.",
        });
      }
      delete DeliveryController.rtoCustomerRefusedVerifiedCache[cacheKey];
    }

    // Update item status to rto_initiated
    const { error: updateError } = await supabase
      .from("order_items")
      .update({
        status: "rto_initiated",
      })
      .eq("id", itemId);

    if (updateError) {
      throw new AppError(`Failed to update item status: ${updateError.message}`, 500);
    }

    // Create order_returns record
    const { data: returnRecord, error: returnError } = await supabase
      .from("order_returns")
      .insert({
        order_id: item.order_id,
        order_item_id: itemId,
        return_type: "rto",
        reason_code: reasonCode,
        reason_text: reasonText || null,
        proof_image_url: proofImageUrl || null,
        initiated_by: partnerId,
        pickup_dp_id: partnerId, // Same DP will return to warehouse
        warehouse_id: item.warehouse_id,
        pickup_address: item.orders?.shipping_address || null,
        status: "initiated",
      })
      .select()
      .single();

    if (returnError) {
      // Rollback item status
      await supabase
        .from("order_items")
        .update({ status: "out_for_delivery" })
        .eq("id", itemId);
      throw new AppError(`Failed to create return record: ${returnError.message}`, 500);
    }

    // Record order event for audit trail
    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const orderEventRepository = new OrderEventRepository(supabase);
    await orderEventRepository.create({
      orderId: item.order_id,
      orderItemId: itemId,
      previousStatus: "out_for_delivery",
      newStatus: "rto_initiated",
      changedBy: partnerId,
      note: `RTO initiated: ${reasonCode}${reasonText ? ` - ${reasonText}` : ""}`,
      metadata: {
        delivery_partner_id: partnerId,
        return_id: returnRecord.id,
        reason_code: reasonCode,
      },
    });

    // Immediately transition to rto_in_transit (same DP is returning)
    await supabase
      .from("order_items")
      .update({
        status: "rto_in_transit",
      })
      .eq("id", itemId);

    await supabase
      .from("order_returns")
      .update({ status: "in_transit" })
      .eq("id", returnRecord.id);

    await orderEventRepository.create({
      orderId: item.order_id,
      orderItemId: itemId,
      previousStatus: "rto_initiated",
      newStatus: "rto_in_transit",
      changedBy: partnerId,
      note: "RTO in transit to warehouse",
      metadata: { delivery_partner_id: partnerId, return_id: returnRecord.id },
    });

    // Send RTO initiated email to customer
    try {
      const { queueRTOInitiatedEmail } = await import("../queue/emailQueue.js");
      const customerEmail = item.orders?.contact_email || item.orders?.users?.email;
      const studentName = item.orders?.shipping_address?.studentName
        || item.orders?.shipping_address?.recipientName
        || item.orders?.users?.full_name
        || "Customer";

      const reasonLabels = {
        customer_unavailable: "Customer was not available at the delivery address",
        address_not_found: "Delivery address could not be located",
        customer_refused: "Customer refused to accept the delivery",
        incorrect_item: "Item was reported as incorrect",
        unsafe_location: "Delivery location was unsafe",
        other: reasonText || "Delivery could not be completed",
      };

      if (customerEmail) {
        await queueRTOInitiatedEmail(customerEmail, {
          orderNumber: item.orders?.order_number,
          studentName,
          items: [{ title: item.title, quantity: item.quantity }],
          reason: reasonLabels[reasonCode] || reasonText || "Delivery attempt unsuccessful",
          nextSteps: "Your order is being returned to our warehouse. Please contact support for redelivery or refund options.",
        });
      }
    } catch (emailErr) {
      logger.error("Failed to send RTO initiated email", { error: emailErr.message });
    }

    res.json({
      success: true,
      data: {
        itemId,
        returnId: returnRecord.id,
        status: "rto_in_transit",
        reasonCode,
      },
      message: "RTO initiated. Please return the item to the warehouse.",
    });
  });

  /**
   * Get all RTO items that this DP needs to return to warehouse
   * GET /api/v1/delivery/rto-items
   */
  getRTOItems = asyncHandler(async (req, res) => {
    const partnerId = req.user?.id;

    logger.info("Fetching RTO items for delivery partner", { partnerId });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    // Fetch order_returns where this DP is the pickup_dp and status is in_transit
    const { data: returns, error } = await supabase
      .from("order_returns")
      .select(`
        id,
        order_id,
        order_item_id,
        return_type,
        reason_code,
        reason_text,
        warehouse_id,
        pickup_address,
        status,
        created_at,
        order_items!order_item_id (
          id, dispatch_id, title, quantity, total_price, status, variant_id
        ),
        orders!order_id (
          id, order_number, shipping_address
        ),
        warehouse!warehouse_id (
          id, name, address
        )
      `)
      .eq("pickup_dp_id", partnerId)
      .eq("return_type", "rto")
      .in("status", ["initiated", "in_transit"])
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError(`Failed to fetch RTO items: ${error.message}`, 500);
    }

    // Enrich with warehouse address for navigation
    const enrichedReturns = await Promise.all((returns || []).map(async (ret) => {
      let warehouseAddress = null;
      if (ret.warehouse?.address && typeof ret.warehouse.address === "string") {
        const { data: addr } = await supabase
          .from("addresses")
          .select("*")
          .eq("id", ret.warehouse.address)
          .single();
        warehouseAddress = addr;
      }

      // Estimate incentive for return trip
      let estimatedIncentive = null;
      if (this.deliveryIncentiveService && warehouseAddress && ret.pickup_address) {
        try {
          const { estimatedIncentive: incentive } = await this.deliveryIncentiveService.estimateIncentive(
            ret.pickup_address,
            warehouseAddress
          );
          estimatedIncentive = incentive;
        } catch {
          // Ignore estimation errors
        }
      }

      return {
        returnId: ret.id,
        orderId: ret.order_id,
        orderNumber: ret.orders?.order_number,
        orderItemId: ret.order_item_id,
        dispatchId: ret.order_items?.dispatch_id || null,
        variantId: ret.order_items?.variant_id || null,
        itemTitle: ret.order_items?.title,
        itemQuantity: ret.order_items?.quantity,
        itemStatus: ret.order_items?.status,
        reasonCode: ret.reason_code,
        reasonText: ret.reason_text,
        warehouseId: ret.warehouse_id,
        warehouseName: ret.warehouse?.name,
        warehouseAddress,
        pickupAddress: ret.pickup_address,
        status: ret.status,
        createdAt: ret.created_at,
        estimatedIncentive,
      };
    }));

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const orderRepo = new OrderRepository(supabase);
    const withVariant = await orderRepo.enrichItemsWithVariantData(enrichedReturns);

    res.json({
      success: true,
      data: withVariant,
      message: `Found ${enrichedReturns.length} RTO item(s) to return.`,
    });
  });

  /**
   * Confirm RTO dropoff at warehouse
   * POST /api/v1/delivery/rto/:returnId/confirm-dropoff
   */
  confirmRTODropoff = asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const partnerId = req.user?.id;

    if (!returnId) {
      return res.status(400).json({
        success: false,
        message: "Return ID is required",
      });
    }

    logger.info("Confirming RTO dropoff", { partnerId, returnId });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    // Fetch return record
    const { data: returnRecord, error: fetchError } = await supabase
      .from("order_returns")
      .select(`
        id, order_id, order_item_id, pickup_dp_id, warehouse_id, status, pickup_address,
        order_items!order_item_id ( id, status ),
        warehouse!warehouse_id ( id, address )
      `)
      .eq("id", returnId)
      .single();

    if (fetchError || !returnRecord) {
      return res.status(404).json({
        success: false,
        message: "Return record not found",
      });
    }

    if (returnRecord.pickup_dp_id !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this return",
      });
    }

    if (returnRecord.status !== "in_transit") {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm dropoff. Return status is "${returnRecord.status}", expected "in_transit"`,
      });
    }

    const cacheKey = `${returnId}_${partnerId}`;
    const verifiedData = DeliveryController.rtoDropoffVerifiedCache[cacheKey];
    const hasVerifiedOtp = !!verifiedData && Date.now() <= verifiedData.expiresAt;
    if (!hasVerifiedOtp) {
      return res.status(403).json({
        success: false,
        requiresOtp: true,
        message: "Retailer OTP verification is required before confirming dropoff.",
      });
    }
    delete DeliveryController.rtoDropoffVerifiedCache[cacheKey];

    // Update return status to completed
    const { error: updateReturnError } = await supabase
      .from("order_returns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", returnId);

    if (updateReturnError) {
      throw new AppError(`Failed to update return status: ${updateReturnError.message}`, 500);
    }

    // Update item status to rto_completed
    const { error: updateItemError } = await supabase
      .from("order_items")
      .update({
        status: "rto_completed",
        locked_by: null,
        locked_at: null,
      })
      .eq("id", returnRecord.order_item_id);

    if (updateItemError) {
      throw new AppError(`Failed to update item status: ${updateItemError.message}`, 500);
    }

    // CRITICAL: Restock inventory for RTO'd item
    try {
      // Get item details for restocking
      const { data: itemData, error: itemFetchError } = await supabase
        .from("order_items")
        .select("product_id, variant_id, quantity")
        .eq("id", returnRecord.order_item_id)
        .single();

      if (!itemFetchError && itemData) {
        const { error: restockError } = await supabase.rpc('atomic_increment_stock', {
          p_variant_id: itemData.variant_id || null,
          p_product_id: itemData.variant_id ? null : itemData.product_id,
          p_quantity: itemData.quantity
        });

        if (restockError) {
          logger.error("RTO restock failed", {
            returnId,
            itemId: returnRecord.order_item_id,
            error: restockError.message
          });
          // Don't fail the RTO completion, but log for manual review
        } else {
          logger.info("RTO: Inventory restocked successfully", {
            returnId,
            productId: itemData.product_id,
            variantId: itemData.variant_id,
            quantity: itemData.quantity
          });
        }
      }
    } catch (restockErr) {
      logger.error("RTO restock exception", { returnId, error: restockErr.message });
      // Don't fail the RTO completion
    }

    // Record order event
    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const orderEventRepository = new OrderEventRepository(supabase);
    await orderEventRepository.create({
      orderId: returnRecord.order_id,
      orderItemId: returnRecord.order_item_id,
      previousStatus: "rto_in_transit",
      newStatus: "rto_completed",
      changedBy: partnerId,
      note: "RTO completed - item returned to warehouse",
      metadata: { delivery_partner_id: partnerId, return_id: returnId },
    });

    // Calculate and credit incentive for return trip
    let incentiveData = null;
    if (this.deliveryIncentiveService) {
      try {
        // Get warehouse address
        let warehouseAddress = null;
        if (returnRecord.warehouse?.address && typeof returnRecord.warehouse.address === "string") {
          const { data: addr } = await supabase
            .from("addresses")
            .select("*")
            .eq("id", returnRecord.warehouse.address)
            .single();
          warehouseAddress = addr;
        }

        if (warehouseAddress && returnRecord.pickup_address) {
          // Calculate incentive using pickup_address → warehouse_address
          incentiveData = await this.deliveryIncentiveService.finalizeReturnIncentive(
            {
              returnId,
              dpUserId: partnerId,
              pickupAddress: returnRecord.pickup_address,
              warehouseAddress,
            },
            supabase
          );
        }
      } catch (err) {
        logger.error("Failed to finalize RTO incentive", {
          returnId,
          partnerId,
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      data: {
        returnId,
        status: "completed",
        itemStatus: "rto_completed",
        ...(incentiveData && {
          distanceKm: incentiveData.distanceKm,
          incentiveAmount: incentiveData.incentiveAmount,
        }),
      },
      message: "RTO dropoff confirmed. Item returned to warehouse successfully.",
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOMER RETURN PICKUP APIs - When customer requests return after delivery
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Admin assigns a customer return pickup to a delivery partner
   * POST /api/v1/admin/delivery/return-pickups/:returnId/assign
   */
  assignReturnPickupByAdmin = asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const { deliveryPartnerId } = req.body || {};
    const adminId = req.user?.id;

    if (!returnId || !deliveryPartnerId) {
      return res.status(400).json({
        success: false,
        message: "Return ID and deliveryPartnerId are required",
      });
    }

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    const { data: returnRecord, error: fetchError } = await supabase
      .from("order_returns")
      .select("id, order_id, order_item_id, return_type, status")
      .eq("id", returnId)
      .single();

    if (fetchError || !returnRecord) {
      return res.status(404).json({
        success: false,
        message: "Return record not found",
      });
    }

    if (returnRecord.return_type !== "customer_return") {
      return res.status(400).json({
        success: false,
        message: "This is not a customer return pickup",
      });
    }

    if (!["initiated", "pickup_assigned"].includes(returnRecord.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign. Return status is "${returnRecord.status}"`,
      });
    }

    const { data: deliveryPartner, error: partnerError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", deliveryPartnerId)
      .single();

    if (partnerError || !deliveryPartner || deliveryPartner.role !== "delivery_partner") {
      return res.status(400).json({
        success: false,
        message: "Invalid deliveryPartnerId",
      });
    }

    const now = new Date().toISOString();
    const { error: updateReturnError } = await supabase
      .from("order_returns")
      .update({
        pickup_dp_id: deliveryPartnerId,
        status: "pickup_assigned",
        updated_at: now,
      })
      .eq("id", returnId);

    if (updateReturnError) {
      throw new AppError(`Failed to assign return pickup: ${updateReturnError.message}`, 500);
    }

    const { error: updateItemError } = await supabase
      .from("order_items")
      .update({
        status: "return_pickup_assigned",
        updated_at: now,
      })
      .eq("id", returnRecord.order_item_id);

    if (updateItemError) {
      throw new AppError(`Failed to update item status: ${updateItemError.message}`, 500);
    }

    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const orderEventRepository = new OrderEventRepository(supabase);
    await orderEventRepository.create({
      orderId: returnRecord.order_id,
      orderItemId: returnRecord.order_item_id,
      previousStatus: returnRecord.status === "initiated" ? "return_requested" : "return_pickup_assigned",
      newStatus: "return_pickup_assigned",
      changedBy: adminId,
      note: "Return pickup assigned by admin",
      metadata: { return_id: returnId, delivery_partner_id: deliveryPartnerId },
    });

    res.json({
      success: true,
      data: {
        returnId,
        deliveryPartnerId,
        status: "pickup_assigned",
        itemStatus: "return_pickup_assigned",
      },
      message: "Return pickup assigned successfully.",
    });
  });

  /**
   * Get all available customer return pickups for delivery partners
   * GET /api/v1/delivery/return-pickups
   */
  getReturnPickups = asyncHandler(async (req, res) => {
    const partnerId = req.user?.id;

    logger.info("Fetching assigned return pickups", { partnerId });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    // Fetch customer returns only when assigned to this DP by admin
    const { data: returns, error } = await supabase
      .from("order_returns")
      .select(`
        id,
        order_id,
        order_item_id,
        return_type,
        reason_code,
        reason_text,
        warehouse_id,
        pickup_address,
        pickup_dp_id,
        status,
        created_at,
        order_items!order_item_id (
          id, title, quantity, total_price, status
        ),
        orders!order_id (
          id, order_number, shipping_address, contact_phone
        ),
        warehouse!warehouse_id (
          id, name, address
        )
      `)
      .eq("return_type", "customer_return")
      .eq("pickup_dp_id", partnerId)
      .in("status", ["pickup_assigned", "in_transit"])
      .order("created_at", { ascending: true });

    if (error) {
      throw new AppError(`Failed to fetch return pickups: ${error.message}`, 500);
    }

    // Enrich with addresses and incentive estimates
    const enrichedReturns = await Promise.all((returns || []).map(async (ret) => {
      let warehouseAddress = null;
      if (ret.warehouse?.address && typeof ret.warehouse.address === "string") {
        const { data: addr } = await supabase
          .from("addresses")
          .select("*")
          .eq("id", ret.warehouse.address)
          .single();
        warehouseAddress = addr;
      }

      // Estimate incentive for return trip (customer → warehouse)
      let estimatedIncentive = null;
      if (this.deliveryIncentiveService && warehouseAddress && ret.pickup_address) {
        try {
          const { estimatedIncentive: incentive } = await this.deliveryIncentiveService.estimateIncentive(
            ret.pickup_address,
            warehouseAddress
          );
          estimatedIncentive = incentive;
        } catch {
          // Ignore estimation errors
        }
      }

      return {
        returnId: ret.id,
        orderId: ret.order_id,
        orderNumber: ret.orders?.order_number,
        orderItemId: ret.order_item_id,
        itemTitle: ret.order_items?.title,
        itemQuantity: ret.order_items?.quantity,
        itemAmount: ret.order_items?.total_price,
        reasonCode: ret.reason_code,
        reasonText: ret.reason_text,
        warehouseId: ret.warehouse_id,
        warehouseName: ret.warehouse?.name,
        warehouseAddress,
        pickupAddress: ret.pickup_address,
        customerPhone: ret.orders?.contact_phone,
        isClaimedByMe: ret.pickup_dp_id === partnerId,
        status: ret.status,
        createdAt: ret.created_at,
        estimatedIncentive,
      };
    }));

    res.json({
      success: true,
      data: enrichedReturns,
      message: `Found ${enrichedReturns.length} assigned return pickup(s).`,
    });
  });

  /**
   * Claim a return pickup
   * POST /api/v1/delivery/return-pickups/:returnId/claim
   */
  claimReturnPickup = asyncHandler(async (req, res) => {
    return res.status(410).json({
      success: false,
      message: "Manual claiming is disabled. Returns are assigned by admin.",
    });
  });

  /**
   * Confirm return pickup from customer
   * POST /api/v1/delivery/return-pickups/:returnId/confirm-pickup
   */
  confirmReturnPickup = asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const partnerId = req.user?.id;

    if (!returnId) {
      return res.status(400).json({
        success: false,
        message: "Return ID is required",
      });
    }

    logger.info("Confirming return pickup from customer", { partnerId, returnId });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    // Fetch return record
    const { data: returnRecord, error: fetchError } = await supabase
      .from("order_returns")
      .select(`
        id, order_id, order_item_id, pickup_dp_id, status, return_type,
        orders!order_id ( order_number, contact_email, shipping_address, users!user_id ( full_name, email ) ),
        order_items!order_item_id ( title, quantity, total_price )
      `)
      .eq("id", returnId)
      .single();

    if (fetchError || !returnRecord) {
      return res.status(404).json({
        success: false,
        message: "Return record not found",
      });
    }

    if (returnRecord.pickup_dp_id !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this return pickup",
      });
    }

    if (returnRecord.status !== "pickup_assigned") {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm pickup. Return status is "${returnRecord.status}", expected "pickup_assigned"`,
      });
    }

    // Update return status to in_transit
    const { error: updateReturnError } = await supabase
      .from("order_returns")
      .update({
        status: "in_transit",
        picked_up_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", returnId);

    if (updateReturnError) {
      throw new AppError(`Failed to update return status: ${updateReturnError.message}`, 500);
    }

    // Update item status to return_in_transit
    const { error: updateItemError } = await supabase
      .from("order_items")
      .update({
        status: "return_in_transit",
        locked_by: partnerId,
        locked_at: new Date().toISOString(),
      })
      .eq("id", returnRecord.order_item_id);

    if (updateItemError) {
      throw new AppError(`Failed to update item status: ${updateItemError.message}`, 500);
    }

    // Record order event
    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const orderEventRepository = new OrderEventRepository(supabase);
    await orderEventRepository.create({
      orderId: returnRecord.order_id,
      orderItemId: returnRecord.order_item_id,
      previousStatus: "return_pickup_assigned",
      newStatus: "return_in_transit",
      changedBy: partnerId,
      note: "Return picked up from customer",
      metadata: { delivery_partner_id: partnerId, return_id: returnId },
    });

    // Send return picked up email to customer
    try {
      const { queueReturnPickedUpEmail } = await import("../queue/emailQueue.js");
      const customerEmail = returnRecord.orders?.contact_email || returnRecord.orders?.users?.email;
      const studentName = returnRecord.orders?.shipping_address?.studentName
        || returnRecord.orders?.shipping_address?.recipientName
        || returnRecord.orders?.users?.full_name
        || "Customer";

      if (customerEmail) {
        await queueReturnPickedUpEmail(customerEmail, {
          orderNumber: returnRecord.orders?.order_number,
          studentName,
          items: [{ title: returnRecord.order_items?.title, quantity: returnRecord.order_items?.quantity }],
          refundAmount: returnRecord.order_items?.total_price,
          refundTimeline: "Once items reach our warehouse and pass quality check, your refund will be processed within 3-5 business days.",
        });
      }
    } catch (emailErr) {
      logger.error("Failed to send return picked up email", { error: emailErr.message });
    }

    res.json({
      success: true,
      data: {
        returnId,
        status: "in_transit",
        itemStatus: "return_in_transit",
      },
      message: "Return pickup confirmed. Please proceed to warehouse for dropoff.",
    });
  });

  /**
   * Confirm return dropoff at warehouse
   * POST /api/v1/delivery/return-pickups/:returnId/confirm-dropoff
   */
  confirmReturnDropoff = asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const partnerId = req.user?.id;

    if (!returnId) {
      return res.status(400).json({
        success: false,
        message: "Return ID is required",
      });
    }

    logger.info("Confirming return dropoff at warehouse", { partnerId, returnId });

    const { getSupabase } = await import("../db/index.js");
    const supabase = getSupabase();

    // Fetch return record
    const { data: returnRecord, error: fetchError } = await supabase
      .from("order_returns")
      .select(`
        id, order_id, order_item_id, pickup_dp_id, warehouse_id, status, pickup_address, return_type,
        order_items!order_item_id ( id, status, total_price ),
        warehouse!warehouse_id ( id, address ),
        orders!order_id ( order_number, contact_email, shipping_address, users!user_id ( full_name, email ) )
      `)
      .eq("id", returnId)
      .single();

    if (fetchError || !returnRecord) {
      return res.status(404).json({
        success: false,
        message: "Return record not found",
      });
    }

    if (returnRecord.pickup_dp_id !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this return",
      });
    }

    if (returnRecord.status !== "in_transit") {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm dropoff. Return status is "${returnRecord.status}", expected "in_transit"`,
      });
    }

    // Update return status to completed
    const { error: updateReturnError } = await supabase
      .from("order_returns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", returnId);

    if (updateReturnError) {
      throw new AppError(`Failed to update return status: ${updateReturnError.message}`, 500);
    }

    // Update item status to returned
    const { error: updateItemError } = await supabase
      .from("order_items")
      .update({
        status: "returned",
        locked_by: null,
        locked_at: null,
      })
      .eq("id", returnRecord.order_item_id);

    if (updateItemError) {
      throw new AppError(`Failed to update item status: ${updateItemError.message}`, 500);
    }

    // Record order event
    const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
    const orderEventRepository = new OrderEventRepository(supabase);
    await orderEventRepository.create({
      orderId: returnRecord.order_id,
      orderItemId: returnRecord.order_item_id,
      previousStatus: "return_in_transit",
      newStatus: "returned",
      changedBy: partnerId,
      note: "Return completed - item returned to warehouse",
      metadata: { delivery_partner_id: partnerId, return_id: returnId },
    });

    // Calculate and credit incentive for return pickup trip
    let incentiveData = null;
    if (this.deliveryIncentiveService) {
      try {
        let warehouseAddress = null;
        if (returnRecord.warehouse?.address && typeof returnRecord.warehouse.address === "string") {
          const { data: addr } = await supabase
            .from("addresses")
            .select("*")
            .eq("id", returnRecord.warehouse.address)
            .single();
          warehouseAddress = addr;
        }

        if (warehouseAddress && returnRecord.pickup_address) {
          incentiveData = await this.deliveryIncentiveService.finalizeReturnIncentive(
            {
              returnId,
              dpUserId: partnerId,
              pickupAddress: returnRecord.pickup_address,
              warehouseAddress,
            },
            supabase
          );
        }
      } catch (err) {
        logger.error("Failed to finalize return pickup incentive", {
          returnId,
          partnerId,
          error: err.message,
        });
      }
    }

    // Send refund processed email (simplified - in production you'd have actual refund processing)
    try {
      const { queueRefundProcessedEmail } = await import("../queue/emailQueue.js");
      const customerEmail = returnRecord.orders?.contact_email || returnRecord.orders?.users?.email;
      const studentName = returnRecord.orders?.shipping_address?.studentName
        || returnRecord.orders?.shipping_address?.recipientName
        || returnRecord.orders?.users?.full_name
        || "Customer";

      if (customerEmail) {
        await queueRefundProcessedEmail(customerEmail, {
          orderNumber: returnRecord.orders?.order_number,
          studentName,
          items: [{ title: returnRecord.order_items?.title, quantity: 1 }],
          refundAmount: returnRecord.order_items?.total_price,
          refundMethod: "Original payment method",
          transactionId: `REF-${Date.now()}`,
        });
      }
    } catch (emailErr) {
      logger.error("Failed to send refund processed email", { error: emailErr.message });
    }

    res.json({
      success: true,
      data: {
        returnId,
        status: "completed",
        itemStatus: "returned",
        ...(incentiveData && {
          distanceKm: incentiveData.distanceKm,
          incentiveAmount: incentiveData.incentiveAmount,
        }),
      },
      message: "Return dropoff confirmed. Item returned to warehouse successfully.",
    });
  });

  /**
   * Get total cash in hand for the DP (delivered COD orders not yet remitted)
   * GET /api/v1/delivery/cash/balance
   */
  getCashBalance = asyncHandler(async (req, res) => {
    const partnerId = req.user?.id;
    const { deliveryRepository } = await import("../repositories/deliveryRepository.js");

    logger.info("Fetching cash balance for DP", { partnerId });

    const orders = await deliveryRepository.getCashInHandOrders(partnerId);
    const totalAmount = orders.reduce((sum, o) => sum + (o.order_total_amount || 0), 0);

    res.json({
      success: true,
      data: {
        totalAmount,
        currency: "INR",
        count: orders.length,
        orders,
      },
    });
  });

  /**
   * Submit cash in hand for admin approval
   * POST /api/v1/delivery/cash/submit
   */
  submitCashRemittance = asyncHandler(async (req, res) => {
    const partnerId = req.user?.id;
    const { orderIds, amount } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order IDs are required for remittance",
      });
    }

    const { deliveryRepository } = await import("../repositories/deliveryRepository.js");

    const remittance = await deliveryRepository.submitCashRemittance(partnerId, orderIds, amount);

    res.status(201).json({
      success: true,
      data: remittance,
      message: "Cash remittance submitted successfully for admin approval",
    });
  });
}

// Default instance (without incentive service — used when DI not wired)
export default new DeliveryController();
