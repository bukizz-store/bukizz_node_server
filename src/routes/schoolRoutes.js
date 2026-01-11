import express from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { schoolSchemas, paramSchemas } from "../models/schemas.js";

/**
 * School Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with school routes
 */
export default function schoolRoutes(dependencies = {}) {
  const router = express.Router();

  // Configure multer for file uploads
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept only image files
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed"), false);
      }
    },
  });

  // Get the school controller from dependencies
  const { schoolController } = dependencies;

  // If no schoolController is provided, return empty router
  if (!schoolController) {
    console.error("SchoolController not found in dependencies");
    return router;
  }

  // Middleware to parse JSON strings from multipart/form-data
  const parseMultipartFields = (req, res, next) => {
    try {
      if (req.body.address && typeof req.body.address === "string") {
        req.body.address = JSON.parse(req.body.address);
      }
      if (req.body.contact && typeof req.body.contact === "string") {
        req.body.contact = JSON.parse(req.body.contact);
      }
      next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format in address or contact fields",
      });
    }
  };

  // Public school routes (no authentication required)

  /**
   * Search schools with filtering
   * GET /api/v1/schools
   */
  router.get(
    "/",
    validate(schoolSchemas.query, "query"),
    schoolController.searchSchools
  );

  /**
   * Get school statistics
   * GET /api/v1/schools/stats
   */
  router.get("/stats", schoolController.getSchoolStats);

  /**
   * Get popular schools
   * GET /api/v1/schools/popular
   */
  router.get("/popular", schoolController.getPopularSchools);

  /**
   * Get nearby schools with geolocation
   * GET /api/v1/schools/nearby
   */
  router.get("/nearby", schoolController.getNearbySchools);

  /**
   * Validate school data (utility endpoint)
   * POST /api/v1/schools/validate
   */
  router.post(
    "/validate",
    validate(schoolSchemas.create),
    schoolController.validateSchoolData
  );

  /**
   * Get schools by city
   * GET /api/v1/schools/city/:city
   */
  router.get(
    "/city/:city",
    validate(paramSchemas.city, "params"),
    schoolController.getSchoolsByCity
  );

  /**
   * Get school by ID with enhanced details
   * GET /api/v1/schools/:id
   */
  router.get(
    "/:id",
    validate(paramSchemas.id, "params"),
    schoolController.getSchool
  );

  /**
   * Get school analytics
   * GET /api/v1/schools/:id/analytics
   */
  router.get(
    "/:id/analytics",
    validate(paramSchemas.id, "params"),
    schoolController.getSchoolAnalytics
  );

  /**
   * Get school product catalog
   * GET /api/v1/schools/:id/catalog
   */
  router.get(
    "/:id/catalog",
    validate(paramSchemas.id, "params"),
    schoolController.getSchoolCatalog
  );

  // Protected routes (require authentication)

  /**
   * Create a new school
   * POST /api/v1/schools
   */
  router.post(
    "/",
    authenticateToken,
    upload.single("image"),
    parseMultipartFields,
    validate(schoolSchemas.create),
    schoolController.createSchool
  );

  /**
   * Update school
   * PUT /api/v1/schools/:id
   */
  router.put(
    "/:id",
    authenticateToken,
    upload.single("image"),
    parseMultipartFields,
    validate(paramSchemas.id, "params"),
    validate(schoolSchemas.update),
    schoolController.updateSchool
  );

  /**
   * Deactivate school (soft delete)
   * DELETE /api/v1/schools/:id
   */
  router.delete(
    "/:id",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    schoolController.deactivateSchool
  );

  /**
   * Reactivate school
   * PATCH /api/v1/schools/:id/reactivate
   */
  router.patch(
    "/:id/reactivate",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    schoolController.reactivateSchool
  );

  /**
   * Bulk import schools from CSV
   * POST /api/v1/schools/bulk-import
   */
  router.post(
    "/bulk-import",
    authenticateToken,
    schoolController.bulkImportSchools
  );

  /**
   * Upload school image
   * POST /api/v1/schools/upload-image
   */
  router.post(
    "/upload-image",
    authenticateToken,
    upload.single("image"),
    schoolController.uploadImage
  );

  // Product association routes

  /**
   * Associate product with school
   * POST /api/v1/schools/:schoolId/products/:productId
   */
  router.post(
    "/:schoolId/products/:productId",
    authenticateToken,
    validate(paramSchemas.schoolId, "params"),
    validate(paramSchemas.productId, "params"),
    validate(schoolSchemas.productAssociation),
    schoolController.associateProduct
  );

  /**
   * Update product association
   * PUT /api/v1/schools/:schoolId/products/:productId/:grade
   */
  router.put(
    "/:schoolId/products/:productId/:grade",
    authenticateToken,
    validate(paramSchemas.schoolId, "params"),
    validate(paramSchemas.productId, "params"),
    validate(paramSchemas.grade, "params"),
    validate(schoolSchemas.updateProductAssociation),
    schoolController.updateProductAssociation
  );

  /**
   * Remove product association with school
   * DELETE /api/v1/schools/:schoolId/products/:productId
   */
  router.delete(
    "/:schoolId/products/:productId",
    authenticateToken,
    validate(paramSchemas.schoolId, "params"),
    validate(paramSchemas.productId, "params"),
    schoolController.removeProductAssociation
  );

  /**
   * Create school partnership
   * POST /api/v1/schools/:id/partnerships
   */
  router.post(
    "/:id/partnerships",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    validate(schoolSchemas.partnership),
    schoolController.createPartnership
  );

  return router;
}
