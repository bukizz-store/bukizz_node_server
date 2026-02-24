import Razorpay from "razorpay";
import crypto from "crypto";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { getSupabase, createServiceClient } from "../db/index.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { AppError } from "../middleware/errorHandler.js";

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export class PaymentController {
    constructor() {
        this.supabase = getSupabase();
        this.serviceClient = createServiceClient();
        this.orderRepository = new OrderRepository(this.supabase);
    }

    /**
     * Create Razorpay Order
     * POST /api/payments/create-order
     */
    createPaymentOrder = asyncHandler(async (req, res) => {
        const { orderId } = req.body;
        const userId = req.user.id;

        // DEBUG: Check if keys are loaded
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            logger.error("Razorpay keys are missing in environment variables");
            throw new AppError("Server configuration error: Missing Payment Keys", 500);
        }

        logger.info("Initiating payment with key:", {
            keyId: process.env.RAZORPAY_KEY_ID ? `${process.env.RAZORPAY_KEY_ID.substring(0, 8)}...` : "missing"
        });

        if (!orderId) {
            throw new AppError("Order ID is required", 400);
        }

        // Get the order
        const order = await this.orderRepository.findById(orderId);

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.userId !== userId) {
            throw new AppError("Access denied", 403);
        }

        if (order.paymentStatus === "paid") {
            throw new AppError("Order is already paid", 400);
        }

        // Validate amount
        if (!order.totalAmount || isNaN(order.totalAmount)) {
            throw new AppError(`Invalid order amount: ${order.totalAmount}`, 400);
        }

        // Options for Razorpay order
        const options = {
            amount: Math.round(order.totalAmount * 100), // amount in smallest currency unit (paise)
            currency: "INR",
            receipt: order.orderNumber,
            notes: {
                orderId: order.id,
                userId: userId,
            },
        };

        try {
            const razorpayOrder = await razorpay.orders.create(options);

            // Log the transaction attempt in DB
            const { error: dbError } = await this.serviceClient
                .from("transactions")
                .insert({
                    order_id: order.id,
                    gateway_order_id: razorpayOrder.id,
                    amount: order.totalAmount,
                    currency: "INR",
                    status: "pending",
                    method: "razorpay",
                });

            if (dbError) {
                logger.error("Failed to log transaction", dbError);
                // Continue anyway as we want to return the order to frontend
            }

            logger.info("Razorpay order created", {
                orderId: order.id,
                razorpayOrderId: razorpayOrder.id,
            });

            res.status(200).json({
                success: true,
                data: {
                    id: razorpayOrder.id,
                    currency: razorpayOrder.currency,
                    amount: razorpayOrder.amount,
                    orderId: order.id, // Our internal order ID
                    key: process.env.RAZORPAY_KEY_ID, // Send key to frontend
                    prefill: {
                        name: order.shippingAddress?.recipientName,
                        contact: order.contactPhone,
                        email: order.contactEmail,
                    },
                },
            });
        } catch (error) {
            logger.error("Razorpay order creation failed FULL ERROR:", error);

            // Construct detailed error message
            let errorMessage = "Failed to initiate payment";
            if (error.error && error.error.description) {
                errorMessage = `Razorpay Error: ${error.error.description}`;
            } else if (error.message) {
                errorMessage = error.message;
            }

            // Include status code if available
            const statusCode = error.statusCode || 500;

            throw new AppError(errorMessage, statusCode);
        }
    });

    /**
     * Verify Payment Signature
     * POST /api/payments/verify
     */
    verifyPayment = asyncHandler(async (req, res) => {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId, // Internal order ID
        } = req.body;

        const userId = req.user.id;

        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature ||
            !orderId
        ) {
            throw new AppError("Missing payment verification details", 400);
        }

        const generated_signature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generated_signature === razorpay_signature) {
            // Payment is successful
            logger.info("Payment signature verified successfully", {
                orderId,
                razorpay_order_id,
                razorpay_payment_id,
            });

            // 1. Update Transaction
            const { error: txnError } = await this.serviceClient
                .from("transactions")
                .update({
                    payment_id: razorpay_payment_id,
                    signature: razorpay_signature,
                    status: "completed",
                    updated_at: new Date().toISOString(),
                })
                .eq("gateway_order_id", razorpay_order_id);

            if (txnError) {
                logger.error("Failed to update transaction", {
                    error: txnError,
                    gateway_order_id: razorpay_order_id
                });
            } else {
                logger.info("Transaction updated successfully", { gateway_order_id: razorpay_order_id });
            }

            // 2. Update Order Status
            // Use service client to ensure privileged update (bypass RLS)
            const { data: updateData, error: updateError } = await this.serviceClient
                .from("orders")
                .update({
                    payment_status: "paid",
                    status: "processed", // Move to processing after payment
                    updated_at: new Date().toISOString(),
                })
                .eq("id", orderId)
                .eq("user_id", userId)
                .select();

            if (updateError) {
                logger.error("Failed to update order status after payment", {
                    error: updateError,
                    orderId,
                    userId
                });
                // Payment valid but DB update failed - critical error
                throw new AppError("Payment verified but failed to update order. Please contact support.", 500);
            } else {
                logger.info("Order status updated successfully", {
                    orderId,
                    updatedData: updateData,
                    newStatus: "paid"
                });

                // 2.1 Update Order Items Status
                const { error: itemsUpdateError } = await this.serviceClient
                    .from("order_items")
                    .update({
                        status: "processed",
                    })
                    .eq("order_id", orderId);

                if (itemsUpdateError) {
                    logger.error("Failed to update order items status after payment", {
                        error: itemsUpdateError,
                        orderId
                    });
                } else {
                    logger.info("Order items status updated to processed", { orderId });
                }
            }

            logger.info("Payment verified and order updated", {
                orderId,
                paymentId: razorpay_payment_id,
            });

            res.status(200).json({
                success: true,
                message: "Payment verified successfully",
            });
        } else {
            // Payment verification failed
            logger.warn("Invalid payment signature", {
                orderId,
                razorpay_order_id,
                razorpay_payment_id,
            });

            // Update transaction as failed
            await this.serviceClient
                .from("transactions")
                .update({
                    payment_id: razorpay_payment_id,
                    status: "failed",
                    error_code: "INVALID_SIGNATURE",
                    updated_at: new Date().toISOString(),
                })
                .eq("gateway_order_id", razorpay_order_id);

            throw new AppError("Invalid payment signature", 400);
        }
    });

    /**
     * Reconcile Payment Status
     * POST /api/payments/reconcile
     * Checks Razorpay for actual payment status if DB is out of sync
     */
    reconcilePayment = asyncHandler(async (req, res) => {
        const { orderId } = req.body;
        const userId = req.user.id;

        if (!orderId) {
            throw new AppError("Order ID is required", 400);
        }

        // 1. Get the order
        const order = await this.orderRepository.findById(orderId);
        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.userId !== userId) {
            throw new AppError("Access denied", 403);
        }

        // If order is already paid/processed, nothing to reconcile
        if (order.paymentStatus === "paid" || order.status !== "initialized") {
            return res.status(200).json({
                success: true,
                message: "Order is already up to date",
                status: order.status,
                paymentStatus: order.paymentStatus
            });
        }

        // 2. Find the transaction for this order to get gateway_order_id
        const { data: transactions, error: txnError } = await this.supabase
            .from("transactions")
            .select("*")
            .eq("order_id", orderId)
            .order("created_at", { ascending: false })
            .limit(1);

        if (txnError || !transactions || transactions.length === 0) {
            throw new AppError("No transaction found for this order", 404);
        }

        const transaction = transactions[0];

        if (!transaction.gateway_order_id) {
            throw new AppError("No payment gateway order ID found", 400);
        }

        // 3. Fetch payments for this order from Razorpay
        try {
            const payments = await razorpay.orders.fetchPayments(transaction.gateway_order_id);

            // Find if any payment was captured
            const capturedPayment = payments?.items?.find((p) => p.status === "captured");

            if (capturedPayment) {
                logger.info("Reconciliation: Found captured payment in Razorpay", {
                    orderId,
                    paymentId: capturedPayment.id
                });

                // Update Transaction
                await this.serviceClient
                    .from("transactions")
                    .update({
                        payment_id: capturedPayment.id,
                        status: "completed",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", transaction.id);

                // Update Order Status
                await this.serviceClient
                    .from("orders")
                    .update({
                        payment_status: "paid",
                        status: "processed",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", orderId);

                // Update Order Items
                await this.serviceClient
                    .from("order_items")
                    .update({ status: "processed" })
                    .eq("order_id", orderId);

                return res.status(200).json({
                    success: true,
                    message: "Payment reconciled and order marked as paid",
                    status: "processed",
                    paymentStatus: "paid"
                });
            } else {
                // No captured payment found on Razorpay
                // Don't auto-cancel yet, just return current status to let the user try again
                return res.status(200).json({
                    success: true,
                    message: "No successful payment found on gateway",
                    status: order.status,
                    paymentStatus: order.paymentStatus
                });
            }
        } catch (razorpayError) {
            logger.error("Failed to fetch payments from Razorpay during reconciliation", razorpayError);
            throw new AppError("Failed to check payment status with gateway", 500);
        }
    });

    /**
    * Handle Razorpay Webhooks
    * POST /api/payments/webhook
    */
    handleWebhook = asyncHandler(async (req, res) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

        // If no secret is set, we can't verify, so ignore or log warning
        if (!secret) {
            logger.warn("RAZORPAY_WEBHOOK_SECRET is not set. Webhooks cannot be verified.");
            return res.status(200).send("Webhook received but not verified");
        }

        const shasum = crypto.createHmac("sha256", secret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest("hex");

        const signature = req.headers["x-razorpay-signature"];

        if (digest === signature) {
            const event = req.body.event;
            const payload = req.body.payload;

            logger.info("Razorpay Webhook Verified", { event });

            if (event === "payment.captured") {
                const payment = payload.payment.entity;
                const orderId = payment.notes.orderId;

                if (orderId) {
                    try {
                        // Ensure order is marked as paid
                        const { error: orderError } = await this.serviceClient
                            .from("orders")
                            .update({
                                payment_status: "paid",
                                status: "processed",
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", orderId);

                        if (orderError) throw new Error(`Orders update failed: ${orderError.message}`);

                        // Update order items too
                        const { error: itemsError } = await this.serviceClient
                            .from("order_items")
                            .update({
                                status: "processed",
                            })
                            .eq("order_id", orderId);

                        if (itemsError) throw new Error(`Order items update failed: ${itemsError.message}`);

                        // Update transaction too
                        const { error: txnError } = await this.serviceClient
                            .from("transactions")
                            .update({
                                payment_id: payment.id,
                                status: "completed", // or captured
                                updated_at: new Date().toISOString(),
                            })
                            .eq("gateway_order_id", payment.order_id);

                        if (txnError) throw new Error(`Transaction update failed: ${txnError.message}`);

                        logger.info("Webhook: Successfully processed captured payment", { orderId, paymentId: payment.id });
                    } catch (captureError) {
                        logger.error("Webhook: Failed to process captured payment updates", {
                            orderId,
                            paymentId: payment.id,
                            error: captureError.message
                        });
                        // Don't throw, let the webhook return 200 so Razorpay doesn't infinitely retry 
                        // when our DB is the issue. The new /reconcile API will handle recovery.
                    }
                }
            } else if (event === "payment.failed") {
                const payment = payload.payment.entity;
                const orderId = payment.notes.orderId;

                if (orderId) {
                    // 1. Update transaction as failed
                    await this.serviceClient
                        .from("transactions")
                        .update({
                            payment_id: payment.id,
                            status: "failed",
                            error_code: payment.error_code,
                            error_description: payment.error_description,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("gateway_order_id", payment.order_id);

                    // 2. Set payment_status to failed immediately (guaranteed)
                    await this.serviceClient
                        .from("orders")
                        .update({ payment_status: "failed", updated_at: new Date().toISOString() })
                        .eq("id", orderId);

                    // 3. Cancel order + restock if still in initialized state (safety net)
                    try {
                        const { OrderService } = await import("../services/orderService.js");
                        const { OrderRepository } = await import("../repositories/orderRepository.js");
                        const { ProductRepository } = await import("../repositories/productRepository.js");
                        const { UserRepository } = await import("../repositories/userRepository.js");
                        const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
                        const { WarehouseRepository } = await import("../repositories/warehouseRepository.js");

                        const orderRepo = new OrderRepository(this.serviceClient);
                        const orderService = new OrderService(
                            orderRepo, new ProductRepository(), new UserRepository(this.serviceClient),
                            new OrderEventRepository(), null, new WarehouseRepository()
                        );

                        const order = await orderRepo.findById(orderId);
                        if (order && order.status === "initialized") {
                            await orderService.cancelOrder(
                                orderId, order.userId,
                                `Webhook: Payment Failed - ${payment.error_description || payment.error_code || "Unknown"}`
                            );
                            logger.info("Webhook: Order auto-cancelled due to payment failure", { orderId });
                        } else {
                            logger.info("Webhook: Order not in initialized state, skipping cancel", {
                                orderId, currentStatus: order?.status
                            });
                        }
                    } catch (cancelError) {
                        logger.error("Webhook: Failed to cancel order after payment failure", {
                            orderId, error: cancelError.message
                        });

                        // Fallback: direct DB updates for status and items
                        try {
                            // await this.serviceClient.from("orders").update({
                            //     status: "cancelled", updated_at: new Date().toISOString(),
                            // }).eq("id", orderId).eq("status", "initialized");

                            // await this.serviceClient.from("order_items").update({
                            //     status: "cancelled",
                            // }).eq("order_id", orderId).neq("status", "cancelled");

                            // logger.info("Webhook fallback: Order and items directly cancelled", { orderId });
                        } catch (fallbackError) {
                            logger.error("Webhook fallback cancellation also failed", { orderId, error: fallbackError.message });
                        }
                    }
                }
            }

            res.status(200).json({ status: "ok" });
        } else {
            logger.error("Invalid Webhook Signature");
            res.status(400).json({ error: "Invalid signature" });
        }
    });

    /**
     * Handle Payment Failure (Explicit from Frontend)
     * POST /api/payments/failure
     */
    handlePaymentFailure = asyncHandler(async (req, res) => {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            error_code,
            error_description,
            orderId
        } = req.body;

        logger.warn("Payment failed reported by frontend", {
            orderId,
            error_code,
            error_description,
        });

        if (razorpay_order_id) {
            await this.serviceClient
                .from("transactions")
                .update({
                    payment_id: razorpay_payment_id,
                    status: "failed",
                    error_code: error_code,
                    error_description: error_description,
                    updated_at: new Date().toISOString(),
                })
                .eq("gateway_order_id", razorpay_order_id);
        }

        // CRITICAL: Cancel the order to release stock and mark as cancelled
        if (orderId) {
            // Set payment_status to failed FIRST (guaranteed, regardless of cancelOrder outcome)
            await this.serviceClient
                .from("orders")
                .update({ payment_status: "failed", updated_at: new Date().toISOString() })
                .eq("id", orderId);

            try {
                const { OrderService } = await import("../services/orderService.js");
                const { OrderRepository } = await import("../repositories/orderRepository.js");
                const { ProductRepository } = await import("../repositories/productRepository.js");
                const { UserRepository } = await import("../repositories/userRepository.js");
                const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
                const { WarehouseRepository } = await import("../repositories/warehouseRepository.js");

                const orderRepo = new OrderRepository(this.serviceClient);
                const prodRepo = new ProductRepository();
                const userRepo = new UserRepository(this.serviceClient);
                const eventRepo = new OrderEventRepository();
                const warehouseRepo = new WarehouseRepository();

                const orderService = new OrderService(orderRepo, prodRepo, userRepo, eventRepo, null, warehouseRepo);

                // Check order status first
                const order = await orderRepo.findById(orderId);
                if (order && order.status === 'initialized') {
                    await orderService.cancelOrder(
                        orderId,
                        req.user?.id || order.userId,
                        `Payment Failed/Cancelled: ${error_description || "User cancelled"}`
                    );
                    logger.info("Order auto-cancelled due to payment failure", { orderId });
                }
            } catch (cancelError) {
                logger.error("Failed to auto-cancel order after payment failure", cancelError);

                // Fallback: directly update order and items via service client
                try {
                    await this.serviceClient
                        .from("orders")
                        .update({
                            status: "cancelled",
                            payment_status: "failed",
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", orderId)
                        .eq("status", "initialized");

                    await this.serviceClient
                        .from("order_items")
                        .update({
                            status: "cancelled",
                        })
                        .eq("order_id", orderId)
                        .neq("status", "cancelled");

                    logger.info("Fallback: Order and items directly cancelled", { orderId });
                } catch (fallbackError) {
                    logger.error("Fallback cancellation also failed", { orderId, error: fallbackError.message });
                }
            }
        }

        res.json({ success: true, message: "Payment failure logged and order cancelled" });
    });
}
