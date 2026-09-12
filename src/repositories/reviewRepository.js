import { executeSupabaseQuery } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Review Repository
 * Handles all database operations for product reviews via Supabase query wrapper.
 * Strictly uses executeSupabaseQuery / executeSupabaseRPC (no raw SQL).
 */
export class ReviewRepository {
  /**
   * Check if a user has a delivered purchase containing this product
   * @param {string} userId - UUID of user
   * @param {string} productId - UUID of product
   * @returns {Promise<{hasPurchased: boolean, isDeliveredPurchase: boolean, orderId: string|null}>}
   */
  async checkUserDeliveredPurchase(userId, productId) {
    try {
      const items = await executeSupabaseQuery("order_items", "select", {
        select: "order_id, orders!inner(id, user_id, status)",
        eq: {
          product_id: productId,
          "orders.user_id": userId,
          "orders.status": "delivered",
        },
        range: { from: 0, to: 0 },
      });

      const hasPurchased = Boolean(items && items.length > 0);
      const orderId = hasPurchased
        ? items[0].order_id || items[0].orders?.id || null
        : null;

      return {
        hasPurchased,
        isDeliveredPurchase: hasPurchased,
        orderId,
        [Symbol.iterator]: function* () {
          yield hasPurchased;
          yield orderId;
        },
      };
    } catch (error) {
      logger.error("Error checking user delivered purchase:", {
        userId,
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch a single review by product ID and user ID
   * Guards against duplicate review submissions
   * @param {string} productId - UUID of product
   * @param {string} userId - UUID of user
   * @returns {Promise<Object|null>} Review object or null
   */
  async findByProductAndUser(productId, userId) {
    try {
      const reviews = await executeSupabaseQuery("product_reviews", "select", {
        select: "*",
        eq: {
          product_id: productId,
          user_id: userId,
        },
        range: { from: 0, to: 0 },
      });

      return reviews && reviews.length > 0 ? reviews[0] : null;
    } catch (error) {
      logger.error("Error finding review by product and user:", {
        productId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch a review by its primary key ID
   * @param {string} reviewId - UUID of review
   * @returns {Promise<Object|null>} Review object or null
   */
  async findById(reviewId) {
    try {
      const reviews = await executeSupabaseQuery("product_reviews", "select", {
        select: "*, users(full_name)",
        eq: {
          id: reviewId,
        },
        range: { from: 0, to: 0 },
      });

      return reviews && reviews.length > 0 ? reviews[0] : null;
    } catch (error) {
      logger.error("Error finding review by ID:", {
        reviewId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a new product review record
   * @param {Object} reviewData - Review creation payload
   * @returns {Promise<Object>} Created review
   */
  async create(reviewData) {
    try {
      const payload = {
        product_id: reviewData.productId || reviewData.product_id,
        user_id: reviewData.userId || reviewData.user_id,
        order_id: reviewData.orderId || reviewData.order_id || null,
        rating: reviewData.rating,
        title: reviewData.title !== undefined ? reviewData.title : null,
        comment: reviewData.comment,
        images: reviewData.images || [],
        is_verified_purchase:
          reviewData.isVerifiedPurchase !== undefined
            ? reviewData.isVerifiedPurchase
            : reviewData.is_verified_purchase !== undefined
              ? reviewData.is_verified_purchase
              : false,
        is_approved:
          reviewData.isApproved !== undefined
            ? reviewData.isApproved
            : reviewData.is_approved !== undefined
              ? reviewData.is_approved
              : true,
      };

      const result = await executeSupabaseQuery("product_reviews", "insert", {
        data: payload,
        select: "*",
      });

      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      logger.error("Error creating review:", {
        error: error.message,
        reviewData,
      });
      throw error;
    }
  }

  /**
   * Update an existing review by ID
   * @param {string} reviewId - UUID of review
   * @param {Object} updateData - Partial review updates
   * @returns {Promise<Object>} Updated review
   */
  async update(reviewId, updateData) {
    try {
      const payload = {
        updated_at: new Date().toISOString(),
      };

      if (updateData.rating !== undefined) payload.rating = updateData.rating;
      if (updateData.title !== undefined) payload.title = updateData.title;
      if (updateData.comment !== undefined) payload.comment = updateData.comment;
      if (updateData.images !== undefined) payload.images = updateData.images;
      if (updateData.isApproved !== undefined) payload.is_approved = updateData.isApproved;
      if (updateData.is_approved !== undefined) payload.is_approved = updateData.is_approved;
      if (updateData.isVerifiedPurchase !== undefined) {
        payload.is_verified_purchase = updateData.isVerifiedPurchase;
      }
      if (updateData.is_verified_purchase !== undefined) {
        payload.is_verified_purchase = updateData.is_verified_purchase;
      }

      const result = await executeSupabaseQuery("product_reviews", "update", {
        data: payload,
        eq: { id: reviewId },
        select: "*",
      });

      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      logger.error("Error updating review:", {
        reviewId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a review by ID
   * @param {string} reviewId - UUID of review
   * @returns {Promise<boolean>} Success boolean
   */
  async delete(reviewId) {
    try {
      await executeSupabaseQuery("product_reviews", "delete", {
        eq: { id: reviewId },
      });
      return true;
    } catch (error) {
      logger.error("Error deleting review:", {
        reviewId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Retrieve paginated approved reviews for a product joined with user details
   * @param {string} productId - UUID of product
   * @param {Object} [options={}] - Query options
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=10] - Items per page
   * @param {number} [options.rating] - Optional filter by rating (1-5)
   * @param {string} [options.sortBy='newest'] - Sort option: 'newest', 'highest_rating', 'lowest_rating'
   * @returns {Promise<{reviews: Array, pagination: {page: number, limit: number, total: number, totalPages: number}}>}
   */
  async findReviewsByProductId(
    productId,
    { page = 1, limit = 10, rating, sortBy = "newest", verifiedOnly = false, hasImages = false } = {}
  ) {
    try {
      let orderColumn = "created_at";
      let ascending = false;

      if (sortBy === "highest_rating") {
        orderColumn = "rating";
        ascending = false;
      } else if (sortBy === "lowest_rating") {
        orderColumn = "rating";
        ascending = true;
      } else if (sortBy === "newest") {
        orderColumn = "created_at";
        ascending = false;
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 10);
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;

      const eqOptions = {
        product_id: productId,
        is_approved: true,
      };

      if (rating !== undefined && rating !== null && rating !== "") {
        eqOptions.rating = Number(rating);
      }

      if (verifiedOnly === true || verifiedOnly === "true") {
        eqOptions.is_verified_purchase = true;
      }

      let reviews = await executeSupabaseQuery("product_reviews", "select", {
        select: "*, users(full_name)",
        eq: eqOptions,
        order: { column: orderColumn, ascending },
        range: { from, to },
      });

      if (hasImages === true || hasImages === "true") {
        reviews = (reviews || []).filter(
          (r) => Array.isArray(r.images) && r.images.length > 0
        );
      }

      // Count total approved reviews for pagination metadata
      const countRows = await executeSupabaseQuery("product_reviews", "select", {
        select: "id",
        eq: eqOptions,
      });
      const total = countRows ? countRows.length : 0;

      return {
        reviews: reviews || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      logger.error("Error finding reviews by product ID:", {
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Retrieve reviews pending moderation for admin queue
   * @param {Object} [options={}] - Query options
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=10] - Items per page
   * @returns {Promise<{reviews: Array, pagination: {page: number, limit: number, total: number, totalPages: number}}>}
   */
  async findPendingModeration({ page = 1, limit = 10 } = {}) {
    try {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 10);
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;

      const eqOptions = {
        is_approved: false,
      };

      const reviews = await executeSupabaseQuery("product_reviews", "select", {
        select: "*, users(full_name, email), products(id, title)",
        eq: eqOptions,
        order: { column: "created_at", ascending: true },
        range: { from, to },
      });

      const countRows = await executeSupabaseQuery("product_reviews", "select", {
        select: "id",
        eq: eqOptions,
      });
      const total = countRows ? countRows.length : 0;

      return {
        reviews: reviews || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      logger.error("Error finding pending moderation reviews:", {
        error: error.message,
      });
      throw error;
    }
  }
}

/**
 * Factory function to create ReviewRepository instance
 * @returns {ReviewRepository}
 */
export function createReviewRepository() {
  return new ReviewRepository();
}

export default createReviewRepository;
