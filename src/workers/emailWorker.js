import { Worker } from "bullmq";
import { getRedisConnection } from "../queue/connection.js";
import { emailService } from "../services/emailService.js";
import { logger } from "../utils/logger.js";

/**
 * Email Worker
 *
 * Processes jobs from the "email" queue. Each job type maps to a
 * specific emailService method. Runs with concurrency 3 (processes
 * up to 3 emails in parallel).
 *
 * Automatic retries are handled by BullMQ (configured in emailQueue.js).
 */

let emailWorker = null;

export function startEmailWorker() {
    if (emailWorker) {
        logger.warn("📧 [EMAIL WORKER] Already running, skipping duplicate start");
        return emailWorker;
    }

    emailWorker = new Worker(
        "email",
        async (job) => {
            const { name, data } = job;

            logger.info(`📧 [EMAIL WORKER] Processing job: ${name}`, {
                jobId: job.id,
                attempt: job.attemptsMade + 1,
            });

            switch (name) {
                case "order-confirmation": {
                    const { email, orderData } = data;
                    await emailService.sendOrderConfirmationEmail(email, orderData);
                    break;
                }

                case "retailer-notification": {
                    const { email, retailerData } = data;
                    await emailService.sendRetailerOrderNotificationEmail(email, retailerData);
                    break;
                }

                case "delivery-confirmation": {
                    const { email, orderData } = data;
                    await emailService.sendOrderDeliveryEmail(email, orderData);
                    break;
                }

                case "otp": {
                    const { email, otp } = data;
                    await emailService.sendOtpEmail(email, otp);
                    break;
                }

                case "verification": {
                    const { email, token, firstName } = data;
                    await emailService.sendVerificationEmail(email, token, firstName);
                    break;
                }

                case "forgot-password": {
                    const { email, resetToken, firstName } = data;
                    await emailService.sendForgotPasswordEmail(email, resetToken, firstName);
                    break;
                }

                default:
                    logger.warn(`📧 [EMAIL WORKER] Unknown job type: ${name}`, { jobId: job.id });
                    throw new Error(`Unknown email job type: ${name}`);
            }

            logger.info(`✅ [EMAIL WORKER] Job completed: ${name}`, { jobId: job.id });
        },
        {
            connection: getRedisConnection(),
            concurrency: 3, // Process up to 3 emails simultaneously
            drainDelay: 30000, // Poll every 30s when idle to reduce Upstash usage
        }
    );

    // ── Event Listeners ──────────────────────────────────────────────────

    emailWorker.on("completed", (job) => {
        logger.info(`✅ [EMAIL WORKER] Job ${job.id} (${job.name}) completed successfully`);
    });

    emailWorker.on("failed", (job, err) => {
        logger.error(`❌ [EMAIL WORKER] Job ${job?.id} (${job?.name}) failed`, {
            error: err.message,
            attempt: job?.attemptsMade,
            maxAttempts: job?.opts?.attempts,
        });
    });

    emailWorker.on("error", (err) => {
        logger.error("❌ [EMAIL WORKER] Worker error:", err.message);
    });

    logger.info("📧 [EMAIL WORKER] Started and listening for jobs");
    return emailWorker;
}

/**
 * Graceful shutdown: close the worker
 */
export async function stopEmailWorker() {
    if (emailWorker) {
        await emailWorker.close();
        emailWorker = null;
        logger.info("🔌 [EMAIL WORKER] Stopped");
    }
}
