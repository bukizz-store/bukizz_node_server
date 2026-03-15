import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import warehouseRepository from "../repositories/warehouseRepository.js";
import { logger } from "../utils/logger.js";
import { dpBankDetailsSchema } from "../models/schemas.js";

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

    // Switch to getAvailableWarehouseItems which returns items + soft-lock logic
    const items = await orderRepository.getAvailableWarehouseItems(warehouseId, partnerId, {
      status: "shipped",
      limit: 100,
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

    if (itemIds.length > 5) {
      return res.status(400).json({
        success: false,
        message: "You can claim a maximum of 5 items at a time",
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

    // Enforce 5-item limit GLOBALLY (existing locks + new claims)
    const existingLockCount = await orderRepository.countValidLocks(partnerId);
    const totalRequested = existingLockCount + itemIds.length;

    if (totalRequested > 5) {
      return res.status(400).json({
        success: false,
        message: `You already have ${existingLockCount} active locks. You can claim at most ${5 - existingLockCount} more items.`,
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
  /**
   * Mark an item as delivered
   * POST /api/v1/delivery/items/:itemId/mark-delivered
   */
  markDelivered = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const partnerId = req.user?.id;
    const { paymentCollected } = req.body || {};

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required",
      });
    }

    logger.info("Marking item as delivered", { partnerId, itemId, paymentCollected });

    const { OrderRepository } = await import("../repositories/orderRepository.js");
    const { getSupabase } = await import("../db/index.js");
    const orderRepository = new OrderRepository(getSupabase());

    const { formatted: updatedItem, orderId } = await orderRepository.markItemDelivered(
      itemId,
      partnerId,
      { markPaymentPaid: !!paymentCollected }
    );

    // Record delivery event for audit trail
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

    // Finalize delivery incentive and credit to DP ledger
    let incentiveData = null;
    if (this.deliveryIncentiveService && orderId) {
      try {
        const supabase = getSupabase();
        // Fetch order's shipping address and warehouse address
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
        // Non-fatal: delivery is still marked, incentive can be reconciled later
      }
    }

    res.json({
      success: true,
      data: {
        ...updatedItem,
        ...(incentiveData && {
          deliveryDistanceKm: incentiveData.distanceKm,
          deliveryIncentiveAmount: incentiveData.incentiveAmount,
        }),
      },
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
          total_price
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

    const orders = (data || []).map((ev) => ({
      eventId: ev.id,
      orderId: ev.order_id,
      orderItemId: ev.order_item_id,
      orderNumber: ev.orders?.order_number || '',
      deliveredAt: ev.created_at,
      title: ev.order_items?.title || 'Unknown Item',
      quantity: ev.order_items?.quantity || 0,
      itemAmount: ev.order_items?.total_price || 0,
      orderTotalAmount: ev.orders?.total_amount || 0,
      shippingAddress: ev.orders?.shipping_address || {},
      paymentMethod: ev.orders?.payment_method || 'COD',
    }));

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
}

// Default instance (without incentive service — used when DI not wired)
export default new DeliveryController();
