import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import { uploadBuffer, getPublicUrl } from "../utils/r2Client.js";
import { createReviewRepository } from "../repositories/reviewRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";

/**
 * Review Service
 * Handles business logic, orchestration, permissions, and image processing for product reviews.
 */
export class ReviewService {
  /**
   * @param {Object} [dependencies={}]
   * @param {Object} [dependencies.reviewRepository]
   * @param {Object} [dependencies.productRepository]
   */
  constructor({ reviewRepository, productRepository } = {}) {
    this.reviewRepository = reviewRepository || createReviewRepository();
    this.productRepository = productRepository || new ProductRepository();
  }

  /**
   * Create a new product review
   *
   * @param {Object} params
   * @param {string} params.productId - UUID of the product
   * @param {string} params.userId - UUID of the authenticated user
   * @param {Object} params.reviewData - Review data payload (rating, title, comment, images)
   * @returns {Promise<Object>} Created review
   */
  async createReview({ productId, userId, reviewData }) {
    try {
      if (!productId || !userId) {
        throw new AppError("Product ID and User ID are required", 400);
      }
      if (!reviewData) {
        throw new AppError("Review data is required", 400);
      }

      // 1. Verify product exists and is active
      const product = await this.productRepository.findById(productId);
      if (!product || product.is_active === false || product.is_deleted === true) {
        throw new AppError("Product not found", 404);
      }

      // 2. Check if user already submitted a review for this product
      const existingReview = await this.reviewRepository.findByProductAndUser(
        productId,
        userId
      );
      if (existingReview) {
        throw new AppError(
          "You have already submitted a review for this product",
          409
        );
      }

      // 3. Check verified purchase status
      const purchaseCheck = await this.reviewRepository.checkUserDeliveredPurchase(
        userId,
        productId
      );
      const isVerifiedPurchase = Boolean(
        purchaseCheck &&
          (purchaseCheck.hasPurchased || purchaseCheck.isDeliveredPurchase)
      );
      const orderId = isVerifiedPurchase ? purchaseCheck.orderId || null : null;

      // 4. Persist review
      const newReview = await this.reviewRepository.create({
        productId,
        userId,
        orderId,
        rating: reviewData.rating,
        title: reviewData.title,
        comment: reviewData.comment,
        images: reviewData.images || [],
        isVerifiedPurchase,
        isApproved: true,
      });

      logger.info("Product review created successfully", {
        reviewId: newReview.id,
        productId,
        userId,
        isVerifiedPurchase,
      });

      return newReview;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error creating review in reviewService:", {
        productId,
        userId,
        error: error.message,
      });
      throw new AppError("Failed to create review", 500);
    }
  }

  /**
   * Get paginated reviews for a product
   *
   * @param {string} productId - UUID of the product
   * @param {Object} [queryParams={}] - Query options (page, limit, rating, sortBy)
   * @returns {Promise<Object>} Paginated reviews and metadata
   */
  async getProductReviews(productId, queryParams = {}) {
    try {
      if (!productId) {
        throw new AppError("Product ID is required", 400);
      }

      // 1. Validate product existence
      const product = await this.productRepository.findById(productId);
      if (!product || product.is_active === false || product.is_deleted === true) {
        throw new AppError("Product not found", 404);
      }

      // 2. Query paginated reviews
      return await this.reviewRepository.findReviewsByProductId(
        productId,
        queryParams
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error fetching product reviews in reviewService:", {
        productId,
        error: error.message,
      });
      throw new AppError("Failed to fetch product reviews", 500);
    }
  }

  /**
   * Fetch review written by a requesting user for a specific product
   *
   * @param {string} productId - UUID of the product
   * @param {string} userId - UUID of the user
   * @returns {Promise<Object|null>} Review entity or null
   */
  async getUserReview(productId, userId) {
    try {
      if (!productId || !userId) {
        throw new AppError("Product ID and User ID are required", 400);
      }

      return await this.reviewRepository.findByProductAndUser(productId, userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error fetching user review in reviewService:", {
        productId,
        userId,
        error: error.message,
      });
      throw new AppError("Failed to fetch user review", 500);
    }
  }

  /**
   * Check if user has purchased and received a delivered order for this product
   *
   * @param {string} userId - UUID of user
   * @param {string} productId - UUID of product
   * @returns {Promise<Object>} { hasPurchased, isDeliveredPurchase, orderId }
   */
  async checkDeliveredPurchase(userId, productId) {
    try {
      if (!productId || !userId) return { hasPurchased: false, isDeliveredPurchase: false };
      return await this.reviewRepository.checkUserDeliveredPurchase(userId, productId);
    } catch (error) {
      logger.error("Error checking delivered purchase in reviewService:", {
        userId,
        productId,
        error: error.message,
      });
      return { hasPurchased: false, isDeliveredPurchase: false };
    }
  }

  /**
   * Update an existing review with ownership/role permission check
   *
   * @param {Object} params
   * @param {string} params.reviewId - UUID of review
   * @param {string} params.userId - UUID of requesting user
   * @param {string} [params.userRole] - Role of user ('admin', 'customer', etc.)
   * @param {Object} params.updateData - Data to update
   * @returns {Promise<Object>} Updated review
   */
  async updateReview({ reviewId, userId, userRole, updateData }) {
    try {
      if (!reviewId) {
        throw new AppError("Review ID is required", 400);
      }
      if (!updateData || Object.keys(updateData).length === 0) {
        throw new AppError("Update data is required", 400);
      }

      // 1. Find review
      const review = await this.reviewRepository.findById(reviewId);
      if (!review) {
        throw new AppError("Review not found", 404);
      }

      // 2. Enforce ownership or admin privilege
      const isOwner = review.user_id === userId;
      const isAdmin = userRole === "admin";
      if (!isOwner && !isAdmin) {
        throw new AppError("Forbidden", 403);
      }

      // 3. Execute update
      const updated = await this.reviewRepository.update(reviewId, updateData);

      logger.info("Review updated successfully", {
        reviewId,
        updatedBy: userId,
      });

      return updated;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error updating review in reviewService:", {
        reviewId,
        userId,
        error: error.message,
      });
      throw new AppError("Failed to update review", 500);
    }
  }

  /**
   * Delete an existing review with ownership/role permission check
   *
   * @param {Object} params
   * @param {string} params.reviewId - UUID of review
   * @param {string} params.userId - UUID of requesting user
   * @param {string} [params.userRole] - Role of user ('admin', 'customer', etc.)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async deleteReview({ reviewId, userId, userRole }) {
    try {
      if (!reviewId) {
        throw new AppError("Review ID is required", 400);
      }

      // 1. Find review
      const review = await this.reviewRepository.findById(reviewId);
      if (!review) {
        throw new AppError("Review not found", 404);
      }

      // 2. Enforce ownership or admin privilege
      const isOwner = review.user_id === userId;
      const isAdmin = userRole === "admin";
      if (!isOwner && !isAdmin) {
        throw new AppError("Forbidden", 403);
      }

      // 3. Execute deletion
      await this.reviewRepository.delete(reviewId);

      logger.info("Review deleted successfully", {
        reviewId,
        deletedBy: userId,
      });

      return { success: true, message: "Review deleted successfully" };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error deleting review in reviewService:", {
        reviewId,
        userId,
        error: error.message,
      });
      throw new AppError("Failed to delete review", 500);
    }
  }

  /**
   * Moderate review approval status (admin)
   *
   * @param {Object} params
   * @param {string} params.reviewId - UUID of review
   * @param {boolean} params.isApproved - Approved status
   * @returns {Promise<Object>} Updated review
   */
  async moderateReview({ reviewId, isApproved }) {
    try {
      if (!reviewId) {
        throw new AppError("Review ID is required", 400);
      }

      const review = await this.reviewRepository.findById(reviewId);
      if (!review) {
        throw new AppError("Review not found", 404);
      }

      const updated = await this.reviewRepository.update(reviewId, {
        isApproved,
      });

      logger.info("Review moderation updated", {
        reviewId,
        isApproved,
      });

      return updated;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error moderating review in reviewService:", {
        reviewId,
        error: error.message,
      });
      throw new AppError("Failed to moderate review", 500);
    }
  }

  /**
   * Process and upload review images to Cloudflare R2
   *
   * @param {Array<Object|Buffer>} files - Array of multer file objects or buffers (max 5)
   * @returns {Promise<string[]>} Array of public CDN URLs
   */
  async uploadReviewImages(files) {
    try {
      if (!files || !Array.isArray(files) || files.length === 0) {
        return [];
      }

      if (files.length > 5) {
        throw new AppError("Maximum of 5 images allowed", 400);
      }

      const uploadPromises = files.map(async (file) => {
        const buffer = Buffer.isBuffer(file) ? file : file.buffer;
        if (!buffer || !Buffer.isBuffer(buffer)) {
          throw new AppError("Invalid image buffer provided", 400);
        }

        // Process via Sharp: auto-orient, max dimension 1200px, WebP at 80% quality
        const processedBuffer = await sharp(buffer)
          .rotate()
          .resize(1200, 1200, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toBuffer();

        const key = `reviews/${uuidv4()}.webp`;

        const uploadResult = await uploadBuffer(processedBuffer, key, {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
        });

        return uploadResult.url || getPublicUrl(key);
      });

      return await Promise.all(uploadPromises);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error uploading review images in reviewService:", {
        error: error.message,
      });
      throw new AppError("Failed to process and upload review images", 500);
    }
  }
}

/**
 * Factory function to create ReviewService instance
 * @param {Object} [dependencies={}]
 * @returns {ReviewService}
 */
export function createReviewService(dependencies = {}) {
  return new ReviewService(dependencies);
}

export default createReviewService;
