import { Worker } from "bullmq";
import { getRedisConnection } from "../queue/connection.js";
import { createServiceClient } from "../db/index.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { logger } from "../utils/logger.js";

/**
 * Webhook Worker
 *
 * Processes Razorpay webhook events from the "webhook" queue.
 * Handles payment.captured and payment.failed events with full
 * DB updates (orders, items, transactions).
 *
 * Automatic retries are handled by BullMQ (5 attempts, exponential backoff).
 */

let webhookWorker = null;

export function startWebhookWorker() {
    if (webhookWorker) {
        logger.warn("🪝 [WEBHOOK WORKER] Already running, skipping duplicate start");
        return webhookWorker;
    }

    const serviceClient = createServiceClient();
    const orderRepository = new OrderRepository(serviceClient);

    webhookWorker = new Worker(
        "webhook",
        async (job) => {
            const { event, payload } = job.data;

            logger.info(`🪝 [WEBHOOK WORKER] Processing: ${event}`, {
                jobId: job.id,
                attempt: job.attemptsMade + 1,
            });

            switch (event) {
                case "payment.captured":
                    await handlePaymentCaptured(payload, serviceClient, orderRepository);
                    break;

                case "payment.failed":
                    await handlePaymentFailed(payload, serviceClient, orderRepository);
                    break;

                default:
                    logger.warn(`🪝 [WEBHOOK WORKER] Unhandled event: ${event}`, { jobId: job.id });
            }

            logger.info(`✅ [WEBHOOK WORKER] Processed: ${event}`, { jobId: job.id });
        },
        {
            connection: getRedisConnection(),
            concurrency: 2, // Process up to 2 webhook events simultaneously
        }
    );

    // ── Event Listeners ──────────────────────────────────────────────────

    webhookWorker.on("completed", (job) => {
        logger.info(`✅ [WEBHOOK WORKER] Job ${job.id} (${job.data.event}) completed`);
    });

    webhookWorker.on("failed", (job, err) => {
        logger.error(`❌ [WEBHOOK WORKER] Job ${job?.id} (${job?.data?.event}) failed`, {
            error: err.message,
            attempt: job?.attemptsMade,
            maxAttempts: job?.opts?.attempts,
        });
    });

    webhookWorker.on("error", (err) => {
        logger.error("❌ [WEBHOOK WORKER] Worker error:", err.message);
    });

    logger.info("🪝 [WEBHOOK WORKER] Started and listening for events");
    return webhookWorker;
}

/**
 * Graceful shutdown
 */
export async function stopWebhookWorker() {
    if (webhookWorker) {
        await webhookWorker.close();
        webhookWorker = null;
        logger.info("🔌 [WEBHOOK WORKER] Stopped");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Handle payment.captured — mark order as paid and processed.
 */
async function handlePaymentCaptured(payload, serviceClient, orderRepository) {
    const payment = payload.payment.entity;
    const orderId = payment.notes.orderId;

    if (!orderId) {
        logger.warn("🪝 payment.captured: No orderId in payment notes, skipping");
        return;
    }

    // Fetch order to check if it was COD
    const order = await orderRepository.findById(orderId);
    if (!order) {
        logger.warn("🪝 payment.captured: Order not found", { orderId });
        return;
    }

    const wasCOD = order.paymentMethod === "cod";

    // Build update payload
    const updatePayload = {
        payment_status: "paid",
        updated_at: new Date().toISOString(),
    };

    // Only set status to processed if not COD (COD is already processed)
    if (!wasCOD) {
        updatePayload.status = "processed";
    }

    // Add remark for COD orders paid online
    if (wasCOD) {
        const existingMeta = order.metadata || {};
        updatePayload.metadata = {
            ...existingMeta,
            paid_online: true,
            paid_online_at: new Date().toISOString(),
            online_payment_id: payment.id,
            remark: "COD order paid online by customer",
        };
    }

    // 1. Update order
    const { error: orderError } = await serviceClient
        .from("orders")
        .update(updatePayload)
        .eq("id", orderId);

    if (orderError) throw new Error(`Orders update failed: ${orderError.message}`);

    // 2. Update order items (only if not COD)
    if (!wasCOD) {
        const { error: itemsError } = await serviceClient
            .from("order_items")
            .update({ status: "processed" })
            .eq("order_id", orderId);

        if (itemsError) throw new Error(`Order items update failed: ${itemsError.message}`);
    }

    // 3. Update transaction
    const { error: txnError } = await serviceClient
        .from("transactions")
        .update({
            payment_id: payment.id,
            status: "completed",
            updated_at: new Date().toISOString(),
        })
        .eq("gateway_order_id", payment.order_id);

    if (txnError) throw new Error(`Transaction update failed: ${txnError.message}`);

    // 4. Send deferred notifications (via email queue)
    if (!wasCOD) {
        try {
            const { OrderService } = await import("../services/orderService.js");
            const { ProductRepository } = await import("../repositories/productRepository.js");
            const { UserRepository } = await import("../repositories/userRepository.js");
            const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
            const { WarehouseRepository } = await import("../repositories/warehouseRepository.js");

            const orderRepo = new OrderRepository(serviceClient);
            const orderService = new OrderService(
                orderRepo, new ProductRepository(), new UserRepository(serviceClient),
                new OrderEventRepository(), null, new WarehouseRepository()
            );

            await orderService.triggerOrderConfirmationNotifications(orderId);
        } catch (notifErr) {
            // Don't fail the job for notification errors — the payment is already captured
            logger.error("🪝 payment.captured: Failed to trigger notifications", {
                orderId, error: notifErr.message,
            });
        }
    }

    logger.info("🪝 payment.captured: Successfully processed", {
        orderId, paymentId: payment.id, wasCOD,
    });
}

/**
 * Handle payment.failed — mark as failed and cancel order if still initialized.
 */
async function handlePaymentFailed(payload, serviceClient, orderRepository) {
    const payment = payload.payment.entity;
    const orderId = payment.notes.orderId;

    if (!orderId) {
        logger.warn("🪝 payment.failed: No orderId in payment notes, skipping");
        return;
    }

    // 1. Update transaction as failed
    await serviceClient
        .from("transactions")
        .update({
            payment_id: payment.id,
            status: "failed",
            error_code: payment.error_code,
            error_description: payment.error_description,
            updated_at: new Date().toISOString(),
        })
        .eq("gateway_order_id", payment.order_id);

    // 2. Set payment_status to failed
    await serviceClient
        .from("orders")
        .update({ payment_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", orderId);

    // 3. Cancel order + restock if still initialized
    try {
        const { OrderService } = await import("../services/orderService.js");
        const { ProductRepository } = await import("../repositories/productRepository.js");
        const { UserRepository } = await import("../repositories/userRepository.js");
        const { OrderEventRepository } = await import("../repositories/orderEventRepository.js");
        const { WarehouseRepository } = await import("../repositories/warehouseRepository.js");

        const orderRepo = new OrderRepository(serviceClient);
        const orderService = new OrderService(
            orderRepo, new ProductRepository(), new UserRepository(serviceClient),
            new OrderEventRepository(), null, new WarehouseRepository()
        );

        const order = await orderRepo.findById(orderId);
        if (order && order.status === "initialized") {
            await orderService.cancelOrder(
                orderId, order.userId,
                `Webhook: Payment Failed - ${payment.error_description || payment.error_code || "Unknown"}`
            );
            logger.info("🪝 payment.failed: Order auto-cancelled", { orderId });
        } else {
            logger.info("🪝 payment.failed: Order not in initialized state, skipping cancel", {
                orderId, currentStatus: order?.status,
            });
        }
    } catch (cancelError) {
        logger.error("🪝 payment.failed: Failed to cancel order", {
            orderId, error: cancelError.message,
        });
    }

    logger.info("🪝 payment.failed: Processed", {
        orderId, paymentId: payment.id,
    });
}
