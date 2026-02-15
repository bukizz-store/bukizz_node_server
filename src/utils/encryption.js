import crypto from "crypto";
import { config } from "../config/index.js";
import { logger } from "./logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;          // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16;    // 128-bit auth tag
const KEY_ENCODING = "hex";
const ENCODING = "hex";

/**
 * Get the encryption key from config.
 * The key must be a 64-char hex string (32 bytes = 256 bits).
 */
function getKey() {
    const key = config.security.encryptionKey;
    if (!key) {
        throw new Error("ENCRYPTION_KEY environment variable is not set");
    }
    return Buffer.from(key, KEY_ENCODING);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a colon-separated string: iv:encrypted:authTag
 *
 * @param {string} plaintext - The text to encrypt
 * @returns {string} Encrypted string in format "iv:ciphertext:authTag"
 */
export function encrypt(plaintext) {
    if (!plaintext) return null;

    try {
        const key = getKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(plaintext, "utf8", ENCODING);
        encrypted += cipher.final(ENCODING);
        const authTag = cipher.getAuthTag().toString(ENCODING);

        return `${iv.toString(ENCODING)}:${encrypted}:${authTag}`;
    } catch (error) {
        logger.error("Encryption error:", error);
        throw new Error("Failed to encrypt data");
    }
}

/**
 * Decrypt a string encrypted by encrypt().
 *
 * @param {string} encryptedText - The "iv:ciphertext:authTag" string
 * @returns {string} Decrypted plaintext
 */
export function decrypt(encryptedText) {
    if (!encryptedText) return null;

    try {
        const key = getKey();
        const [ivHex, encrypted, authTagHex] = encryptedText.split(":");

        const iv = Buffer.from(ivHex, ENCODING);
        const authTag = Buffer.from(authTagHex, ENCODING);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, ENCODING, "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch (error) {
        logger.error("Decryption error:", error);
        throw new Error("Failed to decrypt data");
    }
}

/**
 * Mask an account number for display purposes.
 * Shows only the last 4 digits.
 * e.g. "123456789012" → "XXXX XXXX 9012"
 *
 * @param {string} accountNumber - Plain account number
 * @returns {string} Masked account number
 */
export function maskAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber.length < 4) return "XXXX";
    const last4 = accountNumber.slice(-4);
    return `XXXX XXXX ${last4}`;
}
