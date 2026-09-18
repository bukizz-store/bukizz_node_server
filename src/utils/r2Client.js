import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { config } from "../config/index.js";
import { logger } from "./logger.js";

/**
 * Cloudflare R2 S3-compatible client instance
 */
export const r2Client = new S3Client({
  region: "auto",
  endpoint: config.r2.accountId
    ? `https://${config.r2.accountId}.r2.cloudflarestorage.com`
    : undefined,
  credentials: {
    accessKeyId: config.r2.accessKeyId || "",
    secretAccessKey: config.r2.secretAccessKey || "",
  },
});

/**
 * Get public CDN URL for a given object key
 * @param {string} key - Object key in bucket
 * @returns {string} Public URL
 */
export function getPublicUrl(key) {
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  const publicDomain = (config.r2.publicDomain || "https://cdn.bukizz.in").replace(/\/$/, "");
  return `${publicDomain}/${cleanKey}`;
}

/**
 * Extract storage key from a public CDN URL or return key as is
 * @param {string} keyOrUrl - Object key or full public URL
 * @returns {string} Object key
 */
export function extractKey(keyOrUrl) {
  if (!keyOrUrl) return "";
  if (keyOrUrl.startsWith("http://") || keyOrUrl.startsWith("https://")) {
    try {
      const url = new URL(keyOrUrl);
      return url.pathname.replace(/^\/+/, "");
    } catch {
      return keyOrUrl;
    }
  }
  return keyOrUrl.replace(/^\/+/, "");
}

/**
 * Upload a raw buffer to Cloudflare R2
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} key - Object key in bucket
 * @param {Object} [options={}] - Upload options
 * @param {string} [options.contentType='application/octet-stream'] - Explicit MIME type
 * @param {string} [options.cacheControl='public, max-age=31536000, immutable'] - Cache-Control header
 * @param {string} [options.bucketName] - Target bucket name (defaults to config.r2.bucketName)
 * @param {boolean} [options.convertToWebp=false] - Whether to convert image buffer to WebP before upload
 * @param {number} [options.quality=80] - WebP compression quality (if convertToWebp is true)
 * @param {Object} [options.metadata={}] - Custom object metadata
 * @returns {Promise<{key: string, url: string, bucket: string, contentType: string, size: number}>}
 */
export async function uploadBuffer(buffer, key, options = {}) {
  try {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error("Invalid buffer provided for upload");
    }
    if (!key) {
      throw new Error("Object key is required for upload");
    }

    const bucketName = options.bucketName || config.r2.bucketName;
    if (!bucketName) {
      throw new Error("R2 bucket name is not configured");
    }

    let finalBuffer = buffer;
    let finalContentType = options.contentType || "application/octet-stream";

    // Handle WebP conversion if requested
    if (options.convertToWebp) {
      finalBuffer = await sharp(buffer)
        .webp({ quality: options.quality || 80 })
        .toBuffer();
      finalContentType = "image/webp";
    }

    const cleanKey = extractKey(key);
    const cacheControl = options.cacheControl || "public, max-age=31536000, immutable";

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
      Body: finalBuffer,
      ContentType: finalContentType,
      CacheControl: cacheControl,
      Metadata: options.metadata || {},
    });

    await r2Client.send(command);

    const publicUrl = getPublicUrl(cleanKey);

    logger.info("Successfully uploaded object to Cloudflare R2", {
      key: cleanKey,
      bucket: bucketName,
      contentType: finalContentType,
      size: finalBuffer.length,
    });

    return {
      key: cleanKey,
      url: publicUrl,
      bucket: bucketName,
      contentType: finalContentType,
      size: finalBuffer.length,
    };
  } catch (error) {
    logger.error("Failed to upload buffer to Cloudflare R2", {
      key,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Helper to process and upload an image buffer as WebP to Cloudflare R2
 *
 * @param {Buffer} buffer - Image file buffer
 * @param {string} key - Object key in bucket
 * @param {Object} [options={}] - Processing & upload options
 * @param {number} [options.quality=80] - WebP quality (1-100)
 * @param {number} [options.maxWidth=1600] - Max image width constraint
 * @param {number} [options.maxHeight=1600] - Max image height constraint
 * @param {string} [options.cacheControl='public, max-age=31536000, immutable'] - Cache-Control header
 * @param {string} [options.bucketName] - Target bucket name
 * @returns {Promise<{key: string, url: string, bucket: string, contentType: string, size: number}>}
 */
export async function uploadWebPImage(buffer, key, options = {}) {
  try {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error("Invalid image buffer provided");
    }

    const quality = options.quality || 80;
    const maxWidth = options.maxWidth || 1600;
    const maxHeight = options.maxHeight || 1600;

    let transformer = sharp(buffer).rotate(); // auto-orient from EXIF

    if (maxWidth || maxHeight) {
      transformer = transformer.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const webpBuffer = await transformer.webp({ quality }).toBuffer();

    // Ensure key ends with .webp
    const cleanKey = extractKey(key).replace(/\.[^.]+$/, "") + ".webp";

    return await uploadBuffer(webpBuffer, cleanKey, {
      ...options,
      contentType: "image/webp",
      cacheControl: options.cacheControl || "public, max-age=31536000, immutable",
      convertToWebp: false, // already converted
    });
  } catch (error) {
    logger.error("Failed to process and upload WebP image to Cloudflare R2", {
      key,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete an object from Cloudflare R2 by key or public URL
 *
 * @param {string} keyOrUrl - Object key or full public CDN URL
 * @param {string} [bucketName] - Bucket name (defaults to config.r2.bucketName)
 * @returns {Promise<{success: boolean, key: string}>}
 */
export async function deleteObject(keyOrUrl, bucketName = config.r2.bucketName) {
  try {
    if (!keyOrUrl) {
      throw new Error("Key or URL is required for deletion");
    }
    if (!bucketName) {
      throw new Error("R2 bucket name is not configured");
    }

    const key = extractKey(keyOrUrl);

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await r2Client.send(command);

    logger.info("Successfully deleted object from Cloudflare R2", {
      key,
      bucket: bucketName,
    });

    return {
      success: true,
      key,
    };
  } catch (error) {
    logger.error("Failed to delete object from Cloudflare R2", {
      keyOrUrl,
      error: error.message,
    });
    throw error;
  }
}

export default r2Client;
