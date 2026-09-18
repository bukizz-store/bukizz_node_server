import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Review Controller
 * Handles HTTP requests for product reviews
 */
export class ReviewController {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.reviewService
   */
  constructor({ reviewService }) {
    this.reviewService = reviewService;
  }

  /**
   * Create a review for a product (handles multipart or JSON)
   * POST /api/v1/reviews/products/:productId
   */
  createProductReview = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;

    // Parse existing images array if sent as JSON string (e.g. from FormData)
    let imageUrls = req.body.images || [];
    if (typeof imageUrls === "string") {
      try {
        imageUrls = JSON.parse(imageUrls);
      } catch {
        imageUrls = imageUrls ? [imageUrls] : [];
      }
    }
    if (!Array.isArray(imageUrls)) {
      imageUrls = [];
    }

    // Process uploaded files if any via Multer
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const uploadedUrls = await this.reviewService.uploadReviewImages(req.files);
      imageUrls = [...imageUrls, ...uploadedUrls];
    }

    const reviewData = {
      rating: Number(req.body.rating),
      title: req.body.title || null,
      comment: req.body.comment,
      images: imageUrls,
    };

    const review = await this.reviewService.createReview({
      productId,
      userId,
      reviewData,
    });

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: review,
    });
  });

  /**
   * Get paginated reviews for a product (public)
   * GET /api/v1/reviews/products/:productId
   */
  getProductReviews = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    const result = await this.reviewService.getProductReviews(
      productId,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Reviews retrieved successfully",
      data: result,
    });
  });

  /**
   * Get review written by authenticated user for a specific product
   * GET /api/v1/reviews/products/:productId/my-review
   */
  getMyReview = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;

    const review = await this.reviewService.getUserReview(productId, userId);
    let isDeliveredBuyer = false;
    let deliveredOrderId = null;

    try {
      const purchaseStatus = await this.reviewService.checkDeliveredPurchase(
        userId,
        productId
      );
      if (purchaseStatus && (purchaseStatus.hasPurchased || purchaseStatus.isDeliveredPurchase)) {
        isDeliveredBuyer = true;
        deliveredOrderId = purchaseStatus.orderId || null;
      }
    } catch {
      // Graceful fallback
    }

    return res.status(200).json({
      success: true,
      message: review
        ? "Review retrieved successfully"
        : "No review found for this product",
      data: review,
      isDeliveredBuyer,
      orderId: deliveredOrderId,
    });
  });

  /**
   * Update an existing review
   * PUT /api/v1/reviews/:reviewId
   */
  updateReview = asyncHandler(async (req, res) => {
    const reviewId = req.params.reviewId || req.params.id;
    const userId = req.user.id;
    const userRole =
      req.user.role || (req.user.roles && req.user.roles[0]) || "customer";

    // Parse images if needed
    let updateData = { ...req.body };
    if (typeof updateData.images === "string") {
      try {
        updateData.images = JSON.parse(updateData.images);
      } catch {
        // keep as is if parse fails
      }
    }

    // Process newly uploaded files if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const uploadedUrls = await this.reviewService.uploadReviewImages(req.files);
      const existingImages = Array.isArray(updateData.images)
        ? updateData.images
        : [];
      updateData.images = [...existingImages, ...uploadedUrls];
    }

    const updated = await this.reviewService.updateReview({
      reviewId,
      userId,
      userRole,
      updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: updated,
    });
  });

  /**
   * Delete an existing review
   * DELETE /api/v1/reviews/:reviewId
   */
  deleteReview = asyncHandler(async (req, res) => {
    const reviewId = req.params.reviewId || req.params.id;
    const userId = req.user.id;
    const userRole =
      req.user.role || (req.user.roles && req.user.roles[0]) || "customer";

    const result = await this.reviewService.deleteReview({
      reviewId,
      userId,
      userRole,
    });

    return res.status(200).json({
      success: true,
      message: result.message || "Review deleted successfully",
      data: null,
    });
  });

  /**
   * Admin moderation handler to approve/reject review
   * PATCH /api/v1/reviews/admin/:reviewId/moderate
   */
  moderateReview = asyncHandler(async (req, res) => {
    const reviewId = req.params.reviewId || req.params.id;
    const { isApproved } = req.body;

    const moderated = await this.reviewService.moderateReview({
      reviewId,
      isApproved,
    });

    return res.status(200).json({
      success: true,
      message: "Review moderation status updated successfully",
      data: moderated,
    });
  });
}

/**
 * Factory function to create ReviewController instance
 * @param {Object} dependencies
 * @param {Object} dependencies.reviewService
 * @returns {ReviewController}
 */
export function createReviewController({ reviewService }) {
  return new ReviewController({ reviewService });
}

export default createReviewController;
