import { Queue } from "bullmq";
import { getRedisConnection, isRedisConfigured } from "./connection.js";
import { logger } from "../utils/logger.js";

/**
 * Order Processing Queue
 *
 * Handles post-order-creation tasks and order lifecycle side-effects
 * that can safely run in the background:
 *
 * Job Types:
 *  - order-delivered   → Send delivery email + post-delivery tasks
 *  - order-cancelled   → Restock inventory + update order items
 *  - order-status-event → Log order event to order_events table
 */

let orderQueue = null;

export function getOrderQueue() {
    if (orderQueue) return orderQueue;

    orderQueue = new Queue("order-processing", {
        connection: getRedisConnection(),
        defaultJobOptions: {
            attempts: 4,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 100 },
        },
    });

    orderQueue.on("error", () => {
        // Silently handled
    });

    logger.info("📦 [ORDER QUEUE] Initialized");
    return orderQueue;
}

// ═══════════════════════════════════════════════════════════════════════
//  JOB PRODUCERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Queue post-delivery processing (delivery email + any future delivery tasks).
 * Returns null if Redis unavailable → caller should process inline.
 */
export async function queueOrderDelivered(orderId) {
    if (!isRedisConfigured()) return null;

    try {
        const queue = getOrderQueue();
        const job = await queue.add("order-delivered", { orderId }, {
            jobId: `delivered-${orderId}`, // Deduplicate
        });
        logger.info(`📦 Queued order-delivered for ${orderId}`, { jobId: job.id });
        return job;
    } catch (err) {
        logger.error(`📦 Failed to queue order-delivered`, { orderId, error: err.message });
        return null;
    }
}

/**
 * Queue post-cancellation processing (restock + update items).
 * Returns null if Redis unavailable → caller should process inline.
 */
export async function queueOrderCancelled(orderId, cancelledBy, reason) {
    if (!isRedisConfigured()) return null;

    try {
        const queue = getOrderQueue();
        const job = await queue.add("order-cancelled", { orderId, cancelledBy, reason }, {
            jobId: `cancelled-${orderId}`,
        });
        logger.info(`📦 Queued order-cancelled for ${orderId}`, { jobId: job.id });
        return job;
    } catch (err) {
        logger.error(`📦 Failed to queue order-cancelled`, { orderId, error: err.message });
        return null;
    }
}
