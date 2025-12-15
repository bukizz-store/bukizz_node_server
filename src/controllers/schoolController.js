import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * School Controller
 * Handles HTTP requests for school management operations with enhanced schema support
 */
export class SchoolController {
  constructor(schoolService) {
    this.schoolService = schoolService;
  }

  /**
   * Create a new school
   * POST /api/schools
   */
  createSchool = asyncHandler(async (req, res) => {
    const school = await this.schoolService.createSchool(req.body);

    logger.info("School created", { schoolId: school.id });

    res.status(201).json({
      success: true,
      data: { school },
      message: "School created successfully",
    });
  });

  /**
   * Get school by ID with enhanced details
   * GET /api/schools/:id
   */
  getSchool = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const school = await this.schoolService.getSchool(id);

    res.json({
      success: true,
      data: { school },
      message: "School retrieved successfully",
    });
  });

  /**
   * Search schools with enhanced filtering
   * GET /api/schools
   */
  searchSchools = asyncHandler(async (req, res) => {
    const result = await this.schoolService.searchSchools(req.query);

    res.json({
      success: true,
      data: result,
      message: "Schools retrieved successfully",
    });
  });

  /**
   * Update school
   * PUT /api/schools/:id
   */
  updateSchool = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const school = await this.schoolService.updateSchool(id, req.body);

    logger.info("School updated", { schoolId: id });

    res.json({
      success: true,
      data: { school },
      message: "School updated successfully",
    });
  });

  /**
   * Get schools by city with enhanced filtering
   * GET /api/schools/city/:city
   */
  getSchoolsByCity = asyncHandler(async (req, res) => {
    const { city } = req.params;
    const result = await this.schoolService.getSchoolsByCity(city, req.query);

    res.json({
      success: true,
      data: result,
      message: "Schools retrieved successfully",
    });
  });

  /**
   * Associate product with school
   * POST /api/schools/:schoolId/products/:productId
   */
  associateProduct = asyncHandler(async (req, res) => {
    const { schoolId, productId } = req.params;
    const association = await this.schoolService.associateProduct(
      productId,
      schoolId,
      req.body
    );

    logger.info("Product associated with school", {
      schoolId,
      productId,
      grade: req.body.grade,
    });

    res.status(201).json({
      success: true,
      data: { association },
      message: "Product associated successfully",
    });
  });

  /**
   * Update product association
   * PUT /api/schools/:schoolId/products/:productId/:grade
   */
  updateProductAssociation = asyncHandler(async (req, res) => {
    const { schoolId, productId, grade } = req.params;
    const association = await this.schoolService.updateProductAssociation(
      productId,
      schoolId,
      grade,
      req.body
    );

    logger.info("Product association updated", { schoolId, productId, grade });

    res.json({
      success: true,
      data: { association },
      message: "Product association updated successfully",
    });
  });

  /**
   * Remove product association with school
   * DELETE /api/schools/:schoolId/products/:productId
   */
  removeProductAssociation = asyncHandler(async (req, res) => {
    const { schoolId, productId } = req.params;
    const { grade } = req.query;

    const result = await this.schoolService.removeProductAssociation(
      productId,
      schoolId,
      grade
    );

    logger.info("Product association removed", { schoolId, productId, grade });

    res.json({
      success: true,
      data: result,
      message: "Product association removed successfully",
    });
  });

  /**
   * Get nearby schools with geolocation
   * GET /api/schools/nearby
   */
  getNearbySchools = asyncHandler(async (req, res) => {
    const { lat, lng, radius = 10, ...filters } = req.query;

    const schools = await this.schoolService.getNearbySchools(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius),
      filters
    );

    res.json({
      success: true,
      data: { schools },
      message: "Nearby schools retrieved successfully",
    });
  });

  /**
   * Get popular schools with enhanced metrics
   * GET /api/schools/popular
   */
  getPopularSchools = asyncHandler(async (req, res) => {
    const schools = await this.schoolService.getPopularSchools(req.query);

    res.json({
      success: true,
      data: { schools },
      message: "Popular schools retrieved successfully",
    });
  });

  /**
   * Get school analytics and statistics
   * GET /api/schools/:id/analytics
   */
  getSchoolAnalytics = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const analytics = await this.schoolService.getSchoolAnalytics(id);

    res.json({
      success: true,
      data: { analytics },
      message: "School analytics retrieved successfully",
    });
  });

  /**
   * Create school partnership
   * POST /api/schools/:id/partnerships
   */
  createPartnership = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const partnership = await this.schoolService.createPartnership(
      id,
      req.body
    );

    logger.info("School partnership created", {
      schoolId: id,
      partnerId: partnership.id,
    });

    res.status(201).json({
      success: true,
      data: { partnership },
      message: "Partnership created successfully",
    });
  });

  /**
   * Get school product catalog with pricing
   * GET /api/schools/:id/catalog
   */
  getSchoolCatalog = asyncHandler(async (req, res) => {
    const { id } = req.params;
    console.log("Fetching catalog for school ID:", id, "with query:", req.query);
    const catalog = await this.schoolService.getSchoolCatalog(id, req.query);

    res.json({
      success: true,
      data: catalog,
      message: "School catalog retrieved successfully",
    });
  });

  /**
   * Deactivate school (soft delete)
   * DELETE /api/schools/:id
   */
  deactivateSchool = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await this.schoolService.deactivateSchool(id, reason);

    logger.info("School deactivated", { schoolId: id, reason });

    res.json({
      success: true,
      data: result,
      message: "School deactivated successfully",
    });
  });

  /**
   * Reactivate school
   * PATCH /api/schools/:id/reactivate
   */
  reactivateSchool = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await this.schoolService.reactivateSchool(id);

    logger.info("School reactivated", { schoolId: id });

    res.json({
      success: true,
      data: result,
      message: "School reactivated successfully",
    });
  });

  /**
   * Bulk import schools from CSV
   * POST /api/schools/bulk-import
   */
  bulkImportSchools = asyncHandler(async (req, res) => {
    const { schools } = req.body;
    const adminUserId = req.user?.id;

    if (!schools || !Array.isArray(schools)) {
      return res.status(400).json({
        success: false,
        message: "Schools array is required in request body",
      });
    }

    const result = await this.schoolService.bulkImportSchools(
      schools,
      adminUserId
    );

    logger.info("Bulk school import completed", {
      total: result.summary.total,
      successful: result.summary.successful,
      failed: result.summary.failed,
      adminUserId,
    });

    res.json({
      success: true,
      data: result,
      message: `Bulk import completed: ${result.summary.successful}/${result.summary.total} schools imported successfully`,
    });
  });

  /**
   * Get school statistics
   * GET /api/schools/stats
   */
  getSchoolStats = asyncHandler(async (req, res) => {
    const { city, type, timeframe = "30d" } = req.query;

    // This would be implemented in the service layer
    const stats = {
      totalSchools: 0,
      activeSchools: 0,
      schoolsByType: {},
      schoolsByCity: {},
      recentlyAdded: 0,
      message: "Statistics endpoint - implementation pending",
    };

    res.json({
      success: true,
      data: { stats },
      message: "School statistics retrieved successfully",
    });
  });

  /**
   * Validate school data
   * POST /api/schools/validate
   */
  validateSchoolData = asyncHandler(async (req, res) => {
    try {
      // Basic validation without creating the school
      const requiredFields = [
        "name",
        "type",
        "address",
        "city",
        "state",
        "country",
        "postalCode",
      ];
      const missingFields = [];
      const validationErrors = [];

      for (const field of requiredFields) {
        if (!req.body[field] || req.body[field].toString().trim() === "") {
          missingFields.push(field);
        }
      }

      // Validate school type
      const validTypes = [
        "public",
        "private",
        "charter",
        "international",
        "other",
      ];
      if (req.body.type && !validTypes.includes(req.body.type)) {
        validationErrors.push(
          `Invalid school type. Must be one of: ${validTypes.join(", ")}`
        );
      }

      // Validate postal code
      if (req.body.postalCode && !/^\d{6}$/.test(req.body.postalCode)) {
        validationErrors.push("Invalid postal code format. Must be 6 digits");
      }

      // Validate phone number
      if (req.body.phone && !/^[6-9]\d{9}$/.test(req.body.phone)) {
        validationErrors.push("Invalid phone number format");
      }

      // Validate email
      if (
        req.body.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)
      ) {
        validationErrors.push("Invalid email format");
      }

      const isValid =
        missingFields.length === 0 && validationErrors.length === 0;

      res.json({
        success: true,
        data: {
          isValid,
          missingFields,
          validationErrors,
        },
        message: isValid ? "School data is valid" : "Validation errors found",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }
  });
}
