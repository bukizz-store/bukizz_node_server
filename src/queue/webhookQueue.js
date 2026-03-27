import { Queue } from "bullmq";
import { getRedisConnection, isRedisConfigured } from "./connection.js";
import { logger } from "../utils/logger.js";

/**
 * Webhook Queue
 *
 * Razorpay webhook events are pushed to this queue for reliable
 * background processing. The webhook endpoint verifies the signature,
 * pushes the event to the queue, and immediately returns 200 OK.
 *
 * Job Types:
 *  - payment.captured  → Update order, items, transaction to "paid/processed"
 *  - payment.failed    → Mark payment as failed, cancel order + restock
 */

let webhookQueue = null;

export function getWebhookQueue() {
    if (webhookQueue) return webhookQueue;

    webhookQueue = new Queue("webhook", {
        connection: getRedisConnection(),
        defaultJobOptions: {
            attempts: 5,                                     // Webhooks are critical — retry more
            backoff: { type: "exponential", delay: 3000 },   // 3s → 9s → 27s → 81s → 243s
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 200 },
        },
    });

    webhookQueue.on("error", () => {
        // Silently handled
    });

    logger.info("🪝 [WEBHOOK QUEUE] Initialized");
    return webhookQueue;
}

// ═══════════════════════════════════════════════════════════════════════
//  JOB PRODUCER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Queue a verified Razorpay webhook event for background processing.
 *
 * @param {string} event    - e.g. "payment.captured" or "payment.failed"
 * @param {object} payload  - The full Razorpay webhook payload
 * @returns {Promise<Job|null>} - The queued job, or null if Redis unavailable or missing entity ID
 */
export async function queueWebhookEvent(event, payload) {
    if (!isRedisConfigured()) {
        // Caller should process inline as fallback
        return null;
    }

    // Extract entity ID for idempotency - require it for reliable deduplication
    const paymentId = payload?.payment?.entity?.id;
    const paymentLinkId = payload?.payment_link?.entity?.id;
    const entityId = paymentId || paymentLinkId;

    if (!entityId) {
        logger.error("Webhook payload missing entity ID, cannot ensure idempotency", {
            event,
            hasPayment: !!payload?.payment,
            hasPaymentLink: !!payload?.payment_link
        });
        // Return null to trigger inline processing with its own idempotency check
        return null;
    }

    try {
        const queue = getWebhookQueue();
        // Use event type + entity ID for deterministic idempotency key
        const idempotencyKey = `webhook-${event}-${entityId}`;

        const job = await queue.add(event, { event, payload, idempotencyKey }, {
            // Deduplicate by event + payment ID to prevent double-processing
            jobId: idempotencyKey,
        });
        logger.info(`Queued webhook event: ${event}`, { jobId: job.id, entityId });
        return job;
    } catch (err) {
        // BullMQ will throw if job with same ID exists - this is expected for duplicates
        if (err.message?.includes('Job with')) {
            logger.info(`Webhook already queued (duplicate): ${event}`, { entityId });
            return { id: `webhook-${event}-${entityId}`, duplicate: true };
        }
        logger.error(`Failed to queue webhook event: ${event}`, { error: err.message, entityId });
        return null; // Caller should process inline as fallback
    }
}
