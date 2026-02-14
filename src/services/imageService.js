import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Image Service
 * Handles generic image upload/delete operations
 */
export class ImageService {
    constructor() {
        this.bucketName = "products";
        this.uploadFolder = "temp"; // Temporary folder for uploads before product creation
        this._bucketCache = new Set(); // Cache of buckets we've already verified exist
    }

    /**
     * Ensure a storage bucket exists, create it if it doesn't
     * @param {string} bucketName - Name of the bucket to ensure exists
     */
    async ensureBucketExists(bucketName) {
        // Skip if we've already verified this bucket in this process lifetime
        if (this._bucketCache.has(bucketName)) {
            return;
        }

        try {
            const supabase = getSupabase();

            const { data, error } = await supabase.storage.getBucket(bucketName);

            if (error && error.message?.includes("not found")) {
                logger.info(`Bucket "${bucketName}" not found, creating it...`);
                const { data: createData, error: createError } = await supabase.storage.createBucket(bucketName, {
                    public: true,
                });

                if (createError) {
                    logger.error(`Failed to create bucket "${bucketName}":`, createError);
                    throw new AppError(`Failed to create storage bucket: ${createError.message}`, 500);
                }

                logger.info(`Bucket "${bucketName}" created successfully`);
            } else if (error) {
                logger.error(`Error checking bucket "${bucketName}":`, error);
                throw new AppError(`Failed to check storage bucket: ${error.message}`, 500);
            }

            // Mark as verified
            this._bucketCache.add(bucketName);
        } catch (error) {
            if (error instanceof AppError) throw error;
            logger.error(`Error ensuring bucket "${bucketName}" exists:`, error);
            throw new AppError("Failed to verify storage bucket", 500);
        }
    }

    /**
     * Upload an image to Supabase storage
     * @param {Object} file - File object from multer
     * @returns {Object} { url, path, name }
     */
    async uploadImage(file, bucketName = this.bucketName, folderPath = this.uploadFolder) {
        try {
            const supabase = getSupabase();

            if (!file) {
                throw new AppError("No file provided", 400);
            }

            // Generate unique filename
            // structure: temp/TIMESTAMP-RANDOM-FILENAME
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 8);
            const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
            const finalBucket = bucketName || this.bucketName;
            const finalFolder = folderPath || this.uploadFolder;
            const fileName = `${finalFolder}/${timestamp}-${random}-${cleanName}`;

            // Ensure the bucket exists before uploading
            await this.ensureBucketExists(finalBucket);

            const { data, error } = await supabase.storage
                .from(finalBucket)
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    cacheControl: "3600",
                });

            if (error) {
                const msg = error.message || "Unknown Supabase Error";
                logger.error("Supabase storage upload error:", error);
                throw new AppError(`Failed to upload image: ${msg}`, 500);
            }

            // Get public URL
            const { data: publicUrlData } = supabase.storage
                .from(finalBucket)
                .getPublicUrl(fileName);

            return {
                url: publicUrlData.publicUrl,
                path: fileName,
                name: file.originalname,
                size: file.size,
                type: file.mimetype,
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            logger.error("Error uploading image:", error);
            throw new AppError("Image upload failed", 500);
        }
    }

    /**
     * Delete an image from Supabase storage by URL or Path
     * @param {string} identifier - Full URL or storage path
     * @returns {boolean} Success status
     */
    async deleteImage(identifier, bucketName = this.bucketName) {
        try {
            if (!identifier) {
                throw new AppError("Image identifier is required", 400);
            }

            const supabase = getSupabase();
            let path = identifier;

            // If full URL is provided, extract the path
            // Example URL: https://xyz.supabase.co/storage/v1/object/public/product-images/temp/123-file.jpg
            if (identifier.startsWith("http")) {
                const urlParts = identifier.split(`/${bucketName}/`);
                if (urlParts.length === 2) {
                    path = urlParts[1];
                } else {
                    // It might be a different structure or bucket, but let's try to assume it is the path if not matching
                    logger.warn("Could not extract path from URL, assuming identifier is path or invalid URL");
                }
            }

            // Decode URI components in case the path has %20 etc
            path = decodeURIComponent(path);

            const { error } = await supabase.storage
                .from(bucketName)
                .remove([path]);

            if (error) {
                logger.error("Supabase storage delete error:", error);
                throw new AppError("Failed to delete image", 500);
            }

            return true;
        } catch (error) {
            if (error instanceof AppError) throw error;
            logger.error("Error deleting image:", error);
            throw new AppError("Image deletion failed", 500);
        }
    }

    /**
     * Replace an existing image with a new one
     * @param {string} oldIdentifier - URL or path of old image
     * @param {Object} newFile - New file object
     * @returns {Object} New image details
     */
    async replaceImage(oldIdentifier, newFile, bucketName = this.bucketName, folderPath = this.uploadFolder) {
        try {
            // 1. Delete old image
            if (oldIdentifier) {
                await this.deleteImage(oldIdentifier, bucketName);
            }

            // 2. Upload new image
            return await this.uploadImage(newFile, bucketName, folderPath);
        } catch (error) {
            if (error instanceof AppError) throw error;
            logger.error("Error replacing image:", error);
            throw new AppError("Image replacement failed", 500);
        }
    }
}

export const imageService = new ImageService();
