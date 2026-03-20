import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.js";
import { emailService } from "../services/emailService.js";
import { logger } from "../utils/logger.js";

/**
 * Email Queue
 *
 * All email dispatches go through this queue when Redis is available.
 * If Redis is NOT connected, falls back to direct emailService calls
 * so the system works without Redis during development.
 *
 * Job Types:
 *  - order-confirmation      → sendOrderConfirmationEmail
 *  - retailer-notification   → sendRetailerOrderNotificationEmail
 *  - delivery-confirmation   → sendOrderDeliveryEmail
 *  - otp                     → sendOtpEmail
 *  - verification            → sendVerificationEmail
 *  - forgot-password         → sendForgotPasswordEmail
 */

let emailQueue = null;
let redisAvailable = false;

export function getEmailQueue() {
    if (emailQueue) return emailQueue;

    const connection = getRedisConnection();

    emailQueue = new Queue("email", {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 100 },
        },
    });

    // Track Redis availability
    connection.on("connect", () => {
        redisAvailable = true;
    });

    connection.on("error", () => {
        redisAvailable = false;
    });

    connection.on("close", () => {
        redisAvailable = false;
    });

    emailQueue.on("error", () => {
        // Silently handled — avoids spamming logs
    });

    logger.info("📬 [EMAIL QUEUE] Initialized");
    return emailQueue;
}

/**
 * Check if Redis is connected and the queue is usable.
 */
function isQueueReady() {
    return redisAvailable && emailQueue;
}

// ═══════════════════════════════════════════════════════════════════════
//  JOB PRODUCERS — Call these instead of emailService directly
//  Each has a fallback to call emailService directly if Redis is down.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Queue an order confirmation email for a customer.
 */
export async function queueOrderConfirmationEmail(email, orderData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending order-confirmation email directly to ${email}`);
        return emailService.sendOrderConfirmationEmail(email, orderData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("order-confirmation", { email, orderData });
    logger.info(`📬 Queued order-confirmation email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue an order notification email for a retailer.
 */
export async function queueRetailerOrderNotificationEmail(email, retailerData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending retailer-notification email directly to ${email}`);
        return emailService.sendRetailerOrderNotificationEmail(email, retailerData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("retailer-notification", { email, retailerData });
    logger.info(`📬 Queued retailer-notification email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue a delivery confirmation email for a customer.
 */
export async function queueOrderDeliveryEmail(email, orderData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending delivery-confirmation email directly to ${email}`);
        return emailService.sendOrderDeliveryEmail(email, orderData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("delivery-confirmation", { email, orderData });
    logger.info(`📬 Queued delivery-confirmation email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue an OTP email.
 */
export async function queueOtpEmail(email, otp) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending OTP email directly to ${email}`);
        return emailService.sendOtpEmail(email, otp);
    }
    const queue = getEmailQueue();
    const job = await queue.add("otp", { email, otp }, {
        attempts: 2,
        backoff: { type: "fixed", delay: 3000 },
    });
    logger.info(`📬 Queued OTP email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue a verification email.
 */
export async function queueVerificationEmail(email, token, firstName) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending verification email directly to ${email}`);
        return emailService.sendVerificationEmail(email, token, firstName);
    }
    const queue = getEmailQueue();
    const job = await queue.add("verification", { email, token, firstName });
    logger.info(`📬 Queued verification email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue a forgot-password email.
 */
export async function queueForgotPasswordEmail(email, resetToken, firstName) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending forgot-password email directly to ${email}`);
        return emailService.sendForgotPasswordEmail(email, resetToken, firstName);
    }
    const queue = getEmailQueue();
    const job = await queue.add("forgot-password", { email, resetToken, firstName });
    logger.info(`📬 Queued forgot-password email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue a user query email to admin.
 */
export async function queueUserQueryEmail(adminEmail, queryData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending user-query-admin email directly to ${adminEmail}`);
        return emailService.sendUserQueryEmail(adminEmail, queryData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("user-query", { adminEmail, queryData });
    logger.info(`📬 Queued user-query email for ${adminEmail}`, { jobId: job.id });
    return job;
}

// ═══════════════════════════════════════════════════════════════════════
//  RETURN/RTO EMAIL PRODUCERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Queue an RTO initiated email to customer (delivery failed).
 */
export async function queueRTOInitiatedEmail(email, rtoData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending rto-initiated email directly to ${email}`);
        return emailService.sendRTOInitiatedEmail(email, rtoData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("rto-initiated", { email, rtoData });
    logger.info(`📬 Queued rto-initiated email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue a return approved email to customer.
 */
export async function queueReturnApprovedEmail(email, returnData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending return-approved email directly to ${email}`);
        return emailService.sendReturnApprovedEmail(email, returnData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("return-approved", { email, returnData });
    logger.info(`📬 Queued return-approved email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue a return picked up email to customer.
 */
export async function queueReturnPickedUpEmail(email, returnData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending return-picked-up email directly to ${email}`);
        return emailService.sendReturnPickedUpEmail(email, returnData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("return-picked-up", { email, returnData });
    logger.info(`📬 Queued return-picked-up email for ${email}`, { jobId: job.id });
    return job;
}

/**
 * Queue a refund processed email to customer.
 */
export async function queueRefundProcessedEmail(email, refundData) {
    if (!isQueueReady()) {
        logger.info(`📬 [FALLBACK] Sending refund-processed email directly to ${email}`);
        return emailService.sendRefundProcessedEmail(email, refundData);
    }
    const queue = getEmailQueue();
    const job = await queue.add("refund-processed", { email, refundData });
    logger.info(`📬 Queued refund-processed email for ${email}`, { jobId: job.id });
    return job;
}
