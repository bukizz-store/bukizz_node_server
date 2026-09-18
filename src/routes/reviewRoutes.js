import express from "express";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { cacheMiddleware } from "../middleware/cacheControl.js";
import { upload } from "../middleware/upload.js";
import { paramSchemas, reviewSchemas } from "../models/schemas.js";
import { createReviewController } from "../controllers/reviewController.js";
import { createReviewService } from "../services/reviewService.js";
import { createReviewRepository } from "../repositories/reviewRepository.js";
import ProductRepository from "../repositories/productRepository.js";

/**
 * Review Routes Factory
 *
 * @param {Object} dependencies
 * @param {Object} dependencies.reviewController - Injected review controller
 * @returns {express.Router} Configured Express router
 */
export function createReviewRoutes(dependencies = {}) {
  const router = express.Router();
  let ctrl = dependencies.reviewController;

  if (!ctrl) {
    const reviewRepo = dependencies.reviewRepository || createReviewRepository();
    const reviewSvc =
      dependencies.reviewService ||
      createReviewService({
        reviewRepository: reviewRepo,
        productRepository: dependencies.productRepository || ProductRepository,
      });
    ctrl = createReviewController({ reviewService: reviewSvc });
  }

  // 1. GET /products/:productId
  // Public paginated reviews for a product with 60s cache header
  router.get(
    "/products/:productId",
    cacheMiddleware.details,
    validate(paramSchemas.productId, "params"),
    validate(reviewSchemas.reviewQuery, "query"),
    ctrl.getProductReviews
  );

  // 2. GET /products/:productId/my-review
  // Authenticated user's review for a product
  router.get(
    "/products/:productId/my-review",
    authenticateToken,
    validate(paramSchemas.productId, "params"),
    ctrl.getMyReview
  );

  // 3. POST /products/:productId
  // Create review with optional image uploads (max 5)
  router.post(
    "/products/:productId",
    authenticateToken,
    upload.array("images", 5),
    validate(paramSchemas.productId, "params"),
    validate(reviewSchemas.createReview, "body"),
    ctrl.createProductReview
  );

  // 4. PUT /:reviewId (also supports /:id)
  // Update review (ownership/admin check enforced in service)
  router.put(
    "/:reviewId",
    authenticateToken,
    upload.array("images", 5),
    validate(paramSchemas.id, "params"),
    validate(reviewSchemas.updateReview, "body"),
    ctrl.updateReview
  );

  // 5. DELETE /:reviewId (also supports /:id)
  // Delete review (ownership/admin check enforced in service)
  router.delete(
    "/:reviewId",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    ctrl.deleteReview
  );

  // 6. PATCH /admin/:reviewId/moderate (also supports /admin/:id/moderate)
  // Admin moderation handler to approve/reject reviews
  router.patch(
    "/admin/:reviewId/moderate",
    authenticateToken,
    requireRoles("admin"),
    validate(paramSchemas.id, "params"),
    validate(reviewSchemas.adminModerateReview, "body"),
    ctrl.moderateReview
  );

  return router;
}

export default createReviewRoutes;
