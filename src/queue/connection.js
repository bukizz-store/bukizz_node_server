import IORedis from "ioredis";
import { logger } from "../utils/logger.js";

/**
 * Redis Connection for BullMQ Queues
 *
 * Supports:
 *  - Upstash Redis (via UPSTASH_REDIS_URL)
 *  - Standard Redis (via REDIS_URL or REDIS_HOST / REDIS_PORT / REDIS_PASSWORD)
 *
 * BullMQ requires a raw ioredis connection (not @upstash/redis SDK).
 */

let connection = null;
let _isRedisConfigured = false;

/**
 * Returns true if a Redis URL or host is explicitly configured.
 * Used to decide whether to start the worker or fall back to direct sends.
 */
export function isRedisConfigured() {
    return !!(
        process.env.UPSTASH_REDIS_URL ||
        process.env.REDIS_URL
    );
}

export function getRedisConnection() {
    if (connection) return connection;

    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
    if (redisUrl) {
        _isRedisConfigured = true;

        // Redis Cloud / Upstash may require TLS — auto-enable if URL starts with rediss://
        // Upstash specifically also uses .upstash.io
        const isUpstash = redisUrl.includes("upstash.io");
        const needsTls = redisUrl.startsWith("rediss://") || isUpstash;

        connection = new IORedis(redisUrl, {
            maxRetriesPerRequest: null, // Required by BullMQ
            enableReadyCheck: false,
            ...(needsTls && {
                tls: { rejectUnauthorized: false },
            }),
        });
        logger.info(`📡 [REDIS] Connected via URL${needsTls ? " (TLS enabled)" : ""}`);
    } else {
        // No Redis URL configured — create a connection to localhost
        // but it will likely fail. The emailQueue fallback handles this.
        _isRedisConfigured = false;
        connection = new IORedis({
            host: process.env.REDIS_HOST || "127.0.0.1",
            port: parseInt(process.env.REDIS_PORT || "6379"),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy(times) {
                // Stop retrying after 3 attempts when no URL is configured
                if (times > 3) return null;
                return Math.min(times * 1000, 3000);
            },
            lazyConnect: true, // Don't auto-connect if no URL is configured
        });
        logger.info("📡 [REDIS] No UPSTASH_REDIS_URL configured — email queue will use direct fallback");
    }

    connection.on("error", () => {
        // Silently absorb errors to avoid log spam when Redis isn't available
    });

    connection.on("connect", () => {
        logger.info("✅ [REDIS] Connection established");
    });

    return connection;
}

/**
 * Graceful shutdown: close Redis connection
 */
export async function closeRedisConnection() {
    if (connection) {
        try {
            await connection.quit();
        } catch {
            // Ignore errors during shutdown
        }
        connection = null;
        logger.info("🔌 [REDIS] Connection closed");
    }
}
