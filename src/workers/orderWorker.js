import { Worker } from "bullmq";
import { getRedisConnection } from "../queue/connection.js";
import { createServiceClient } from "../db/index.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { queueOrderDeliveryEmail } from "../queue/emailQueue.js";
import { logger } from "../utils/logger.js";

/**
 * Order Processing Worker
 *
 * Processes post-status-change side-effects from the "order-processing" queue.
 * Handles delivery notifications and cancellation cleanup in the background.
 */

let orderWorker = null;

export function startOrderWorker() {
    if (orderWorker) {
        logger.warn("📦 [ORDER WORKER] Already running, skipping duplicate start");
        return orderWorker;
    }

    const serviceClient = createServiceClient();
    const orderRepository = new OrderRepository(serviceClient);

    orderWorker = new Worker(
        "order-processing",
        async (job) => {
            const { name, data } = job;

            logger.info(`📦 [ORDER WORKER] Processing: ${name}`, {
                jobId: job.id,
                attempt: job.attemptsMade + 1,
            });

            switch (name) {
                case "order-delivered":
                    await handleOrderDelivered(data.orderId, orderRepository);
                    break;

                case "order-cancelled":
                    await handleOrderCancelled(data.orderId, data.cancelledBy, data.reason, serviceClient, orderRepository);
                    break;

                default:
                    logger.warn(`📦 [ORDER WORKER] Unknown job type: ${name}`, { jobId: job.id });
            }

            logger.info(`✅ [ORDER WORKER] Processed: ${name}`, { jobId: job.id });
        },
        {
            connection: getRedisConnection(),
            concurrency: 2,
        }
    );

    orderWorker.on("completed", (job) => {
        logger.info(`✅ [ORDER WORKER] Job ${job.id} (${job.name}) completed`);
    });

    orderWorker.on("failed", (job, err) => {
        logger.error(`❌ [ORDER WORKER] Job ${job?.id} (${job?.name}) failed`, {
            error: err.message,
            attempt: job?.attemptsMade,
        });
    });

    orderWorker.on("error", (err) => {
        logger.error("❌ [ORDER WORKER] Worker error:", err.message);
    });

    logger.info("📦 [ORDER WORKER] Started and listening for jobs");
    return orderWorker;
}

export async function stopOrderWorker() {
    if (orderWorker) {
        await orderWorker.close();
        orderWorker = null;
        logger.info("🔌 [ORDER WORKER] Stopped");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Handle order-delivered: Send delivery email to customer.
 */
async function handleOrderDelivered(orderId, orderRepository) {
    const order = await orderRepository.findById(orderId);
    if (!order) {
        logger.warn("📦 order-delivered: Order not found", { orderId });
        return;
    }

    const studentName = order.shippingAddress?.studentName
        || order.shippingAddress?.recipientName
        || "Customer";

    const orderData = {
        orderNumber: order.orderNumber,
        studentName,
        items: (order.items || []).map(item => ({
            title: item.title,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            variantLabel: item.productSnapshot?.variantInfo?.metadata?.label || null,
        })),
        totalAmount: order.totalAmount,
    };

    // Send delivery email via the email queue (double-queued for reliability)
    const customerEmail = order.contactEmail;
    if (customerEmail) {
        await queueOrderDeliveryEmail(customerEmail, orderData);
        logger.info("📦 order-delivered: Delivery email queued", { orderId, email: customerEmail });
    }

    logger.info("📦 order-delivered: Processed", { orderId });
}

/**
 * Handle order-cancelled: Restock inventory + mark items as cancelled.
 */
async function handleOrderCancelled(orderId, cancelledBy, reason, serviceClient, orderRepository) {
    logger.info(`📦 order-cancelled: Restocking for ${orderId}`, { cancelledBy, reason });

    // 1. Restock inventory
    try {
        const order = await orderRepository.findById(orderId);
        if (!order || !order.items) {
            logger.warn("📦 order-cancelled: No items to restock", { orderId });
            return;
        }

        for (const item of order.items) {
            if (!item.variantId || !item.quantity) continue;

            const { error } = await serviceClient.rpc("increment_variant_stock", {
                p_variant_id: item.variantId,
                p_quantity: item.quantity,
            });

            if (error) {
                // Fallback: direct increment
                const { data: variant } = await serviceClient
                    .from("product_variants")
                    .select("stock")
                    .eq("id", item.variantId)
                    .single();

                if (variant) {
                    await serviceClient
                        .from("product_variants")
                        .update({ stock: (variant.stock || 0) + item.quantity })
                        .eq("id", item.variantId);
                }
            }

            logger.info("📦 Restocked variant", {
                orderId, variantId: item.variantId, quantity: item.quantity,
            });
        }
    } catch (restockError) {
        logger.error("📦 order-cancelled: Restock failed", { orderId, error: restockError.message });
        throw restockError; // Retry via BullMQ
    }

    // 2. Mark all order items as cancelled
    try {
        const { error } = await serviceClient
            .from("order_items")
            .update({ status: "cancelled" })
            .eq("order_id", orderId)
            .neq("status", "cancelled");

        if (error) throw error;
        logger.info("📦 order-cancelled: Items marked as cancelled", { orderId });
    } catch (itemsError) {
        logger.error("📦 order-cancelled: Failed to update items", { orderId, error: itemsError.message });
        throw itemsError; // Retry via BullMQ
    }

    logger.info("📦 order-cancelled: Fully processed", { orderId });
}
