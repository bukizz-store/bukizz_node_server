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
            removeOnComplete: { count: 500 },
            removeOnFail: { count: 1000 },
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
 * @returns {Promise<Job|null>} - The queued job, or null if Redis unavailable
 */
export async function queueWebhookEvent(event, payload) {
    if (!isRedisConfigured()) {
        // Caller should process inline as fallback
        return null;
    }

    try {
        const queue = getWebhookQueue();
        const job = await queue.add(event, { event, payload }, {
            // Deduplicate by payment ID to prevent double-processing
            jobId: `webhook-${payload?.payment?.entity?.id || Date.now()}`,
        });
        logger.info(`🪝 Queued webhook event: ${event}`, { jobId: job.id });
        return job;
    } catch (err) {
        logger.error(`🪝 Failed to queue webhook event: ${event}`, { error: err.message });
        return null; // Caller should process inline as fallback
    }
}
