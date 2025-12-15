import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * School Service
 * Handles school management business logic with enhanced schema support
 */
export class SchoolService {
  constructor(schoolRepository) {
    this.schoolRepository = schoolRepository;
  }

  /**
   * Create a new school with enhanced validation
   */
  async createSchool(schoolData) {
    try {
      // Validate required fields
      const requiredFields = [
        "name",
        "type",
        "address",
        "city",
        "state",
        "country",
        "postalCode",
      ];
      for (const field of requiredFields) {
        if (!schoolData[field] || schoolData[field].toString().trim() === "") {
          throw new AppError(`${field} is required`, 400);
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
      if (!validTypes.includes(schoolData.type)) {
        throw new AppError(
          `Invalid school type. Must be one of: ${validTypes.join(", ")}`,
          400
        );
      }

      // Validate postal code format
      if (!/^\d{6}$/.test(schoolData.postalCode)) {
        throw new AppError("Invalid postal code format. Must be 6 digits", 400);
      }

      // Validate phone number if provided
      if (schoolData.phone && !/^[6-9]\d{9}$/.test(schoolData.phone)) {
        throw new AppError("Invalid phone number format", 400);
      }

      // Validate email if provided
      if (
        schoolData.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolData.email)
      ) {
        throw new AppError("Invalid email format", 400);
      }

      // Check for duplicate school names in the same city
      const existingSchool = await this.schoolRepository.findByNameAndCity(
        schoolData.name.trim(),
        schoolData.city.trim()
      );
      if (existingSchool) {
        throw new AppError(
          "A school with this name already exists in the city",
          409
        );
      }

      const school = await this.schoolRepository.create(schoolData);

      logger.info(`School created: ${school.id}`, { schoolName: school.name });
      return school;
    } catch (error) {
      logger.error("Error creating school:", error);
      throw error;
    }
  }

  /**
   * Get school by ID with enhanced details
   */
  async getSchool(schoolId) {
    try {
      const school = await this.schoolRepository.findById(schoolId);
      if (!school || !school.isActive) {
        throw new AppError("School not found or inactive", 404);
      }

      // Get additional school data
      const [products, analytics, partnerships] = await Promise.all([
        this.schoolRepository.getSchoolProducts(schoolId),
        this.schoolRepository.getSchoolAnalytics(schoolId),
        this.schoolRepository.getSchoolPartnerships(schoolId),
      ]);

      return {
        ...school,
        products: products || [],
        analytics: analytics || {},
        partnerships: partnerships || [],
      };
    } catch (error) {
      logger.error("Error getting school:", error);
      throw error;
    }
  }

  /**
   * Search schools with enhanced filters
   */
  async searchSchools(filters) {
    try {
      // Validate and sanitize filters
      const cleanFilters = { ...filters };

      // Validate school type filter
      if (cleanFilters.type) {
        const validTypes = [
          "public",
          "private",
          "charter",
          "international",
          "other",
        ];
        if (!validTypes.includes(cleanFilters.type)) {
          throw new AppError(
            `Invalid school type filter. Must be one of: ${validTypes.join(
              ", "
            )}`,
            400
          );
        }
      }

      // Validate board filter
      if (cleanFilters.board) {
        const validBoards = [
          "CBSE",
          "ICSE",
          "State Board",
          "IB",
          "IGCSE",
          "Other",
        ];
        if (!validBoards.includes(cleanFilters.board)) {
          throw new AppError(
            `Invalid board filter. Must be one of: ${validBoards.join(", ")}`,
            400
          );
        }
      }

      // Validate pagination
      cleanFilters.page = Math.max(1, parseInt(cleanFilters.page) || 1);
      cleanFilters.limit = Math.min(
        100,
        Math.max(1, parseInt(cleanFilters.limit) || 20)
      );

      // Validate sort options
      const validSortFields = [
        "name",
        "city",
        "established_year",
        "created_at",
        "student_count",
      ];
      if (
        cleanFilters.sortBy &&
        !validSortFields.includes(cleanFilters.sortBy)
      ) {
        cleanFilters.sortBy = "name";
      }

      if (
        cleanFilters.sortOrder &&
        !["asc", "desc"].includes(cleanFilters.sortOrder)
      ) {
        cleanFilters.sortOrder = "asc";
      }

      return await this.schoolRepository.search(cleanFilters);
    } catch (error) {
      logger.error("Error searching schools:", error);
      throw error;
    }
  }

  /**
   * Update school with enhanced validation
   */
  async updateSchool(schoolId, updateData) {
    try {
      const existingSchool = await this.schoolRepository.findById(schoolId);
      if (!existingSchool || !existingSchool.isActive) {
        throw new AppError("School not found or inactive", 404);
      }

      // Validate school type if being updated
      if (updateData.type) {
        const validTypes = [
          "public",
          "private",
          "charter",
          "international",
          "other",
        ];
        if (!validTypes.includes(updateData.type)) {
          throw new AppError(
            `Invalid school type. Must be one of: ${validTypes.join(", ")}`,
            400
          );
        }
      }

      // Validate postal code if being updated
      if (updateData.postalCode && !/^\d{6}$/.test(updateData.postalCode)) {
        throw new AppError("Invalid postal code format. Must be 6 digits", 400);
      }

      // Validate phone number if being updated
      if (updateData.phone && !/^[6-9]\d{9}$/.test(updateData.phone)) {
        throw new AppError("Invalid phone number format", 400);
      }

      // Validate email if being updated
      if (
        updateData.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateData.email)
      ) {
        throw new AppError("Invalid email format", 400);
      }

      // Check for duplicate name if name or city is being updated
      if (updateData.name || updateData.city) {
        const nameToCheck = updateData.name?.trim() || existingSchool.name;
        const cityToCheck = updateData.city?.trim() || existingSchool.city;

        const duplicateSchool = await this.schoolRepository.findByNameAndCity(
          nameToCheck,
          cityToCheck
        );
        if (duplicateSchool && duplicateSchool.id !== schoolId) {
          throw new AppError(
            "A school with this name already exists in the city",
            409
          );
        }
      }

      const updatedSchool = await this.schoolRepository.update(
        schoolId,
        updateData
      );

      logger.info(`School updated: ${schoolId}`);
      return updatedSchool;
    } catch (error) {
      logger.error("Error updating school:", error);
      throw error;
    }
  }

  /**
   * Get schools by city with enhanced filtering
   */
  async getSchoolsByCity(city, filters = {}) {
    try {
      if (!city || city.trim().length === 0) {
        throw new AppError("City name is required", 400);
      }

      const searchFilters = {
        city: city.trim(),
        isActive: true,
        ...filters,
        page: Math.max(1, parseInt(filters.page) || 1),
        limit: Math.min(50, Math.max(1, parseInt(filters.limit) || 20)),
      };

      // console.log("Searching schools in city with filters:", searchFilters);

      return await this.schoolRepository.search(searchFilters);
    } catch (error) {
      logger.error("Error getting schools by city:", error);
      throw error;
    }
  }

  /**
   * Associate product with school with enhanced validation
   */
  async associateProduct(productId, schoolId, associationData) {
    try {
      // Verify school exists and is active
      const school = await this.schoolRepository.findById(schoolId);
      if (!school || !school.isActive) {
        throw new AppError("School not found or inactive", 404);
      }

      // Validate required fields
      if (!associationData.grade || associationData.grade.trim().length === 0) {
        throw new AppError("Grade is required", 400);
      }

      // Validate grade format
      const validGrades = [
        "Pre-KG",
        "LKG",
        "UKG",
        "1st",
        "2nd",
        "3rd",
        "4th",
        "5th",
        "6th",
        "7th",
        "8th",
        "9th",
        "10th",
        "11th",
        "12th",
      ];
      if (!validGrades.includes(associationData.grade)) {
        throw new AppError(
          `Invalid grade. Must be one of: ${validGrades.join(", ")}`,
          400
        );
      }

      // Check if association already exists
      const existingAssociation =
        await this.schoolRepository.getProductAssociation(
          productId,
          schoolId,
          associationData.grade
        );
      if (existingAssociation) {
        throw new AppError(
          "Product is already associated with this school and grade",
          409
        );
      }

      const association = await this.schoolRepository.associateProduct(
        productId,
        schoolId,
        associationData
      );

      logger.info(
        `Product associated with school: ${productId} -> ${schoolId}`,
        {
          grade: associationData.grade,
          mandatory: associationData.mandatory,
        }
      );

      return association;
    } catch (error) {
      logger.error("Error associating product with school:", error);
      throw error;
    }
  }

  /**
   * Update product association
   */
  async updateProductAssociation(productId, schoolId, grade, updateData) {
    try {
      // Verify school exists
      const school = await this.schoolRepository.findById(schoolId);
      if (!school || !school.isActive) {
        throw new AppError("School not found or inactive", 404);
      }

      // Verify association exists
      const existingAssociation =
        await this.schoolRepository.getProductAssociation(
          productId,
          schoolId,
          grade
        );
      if (!existingAssociation) {
        throw new AppError("Product association not found", 404);
      }

      const updatedAssociation =
        await this.schoolRepository.updateProductAssociation(
          productId,
          schoolId,
          grade,
          updateData
        );

      logger.info(`Product association updated: ${productId} -> ${schoolId}`, {
        grade,
      });
      return updatedAssociation;
    } catch (error) {
      logger.error("Error updating product association:", error);
      throw error;
    }
  }

  /**
   * Remove product association with school
   */
  async removeProductAssociation(productId, schoolId, grade = null) {
    try {
      // Verify school exists
      const school = await this.schoolRepository.findById(schoolId);
      if (!school) {
        throw new AppError("School not found", 404);
      }

      await this.schoolRepository.removeProductAssociation(
        productId,
        schoolId,
        grade
      );

      logger.info(`Product association removed: ${productId} -> ${schoolId}`, {
        grade,
      });
      return {
        message: "Product association removed successfully",
        productId,
        schoolId,
        ...(grade && { grade }),
      };
    } catch (error) {
      logger.error("Error removing product association:", error);
      throw error;
    }
  }

  /**
   * Get nearby schools with geolocation support
   */
  async getNearbySchools(lat, lng, radiusKm = 10, filters = {}) {
    try {
      // Validate coordinates
      if (!lat || !lng || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new AppError("Valid latitude and longitude are required", 400);
      }

      // Validate radius
      if (radiusKm <= 0 || radiusKm > 100) {
        throw new AppError("Radius must be between 1 and 100 kilometers", 400);
      }

      return await this.schoolRepository.findNearby(
        lat,
        lng,
        radiusKm,
        filters
      );
    } catch (error) {
      logger.error("Error getting nearby schools:", error);
      throw error;
    }
  }

  /**
   * Get popular schools with enhanced metrics
   */
  async getPopularSchools(filters = {}) {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(filters.limit) || 10));
      const city = filters.city?.trim();

      return await this.schoolRepository.getPopularSchools(limit, city);
    } catch (error) {
      logger.error("Error getting popular schools:", error);
      throw error;
    }
  }

  /**
   * Get school analytics and statistics
   */
  async getSchoolAnalytics(schoolId) {
    try {
      const school = await this.schoolRepository.findById(schoolId);
      if (!school || !school.isActive) {
        throw new AppError("School not found or inactive", 404);
      }

      return await this.schoolRepository.getSchoolAnalytics(schoolId);
    } catch (error) {
      logger.error("Error getting school analytics:", error);
      throw error;
    }
  }

  /**
   * Create or update school partnership
   */
  async createPartnership(schoolId, partnershipData) {
    try {
      const school = await this.schoolRepository.findById(schoolId);
      if (!school || !school.isActive) {
        throw new AppError("School not found or inactive", 404);
      }

      // Validate partnership data
      if (!partnershipData.partnerName || !partnershipData.partnerType) {
        throw new AppError("Partner name and type are required", 400);
      }

      const validPartnerTypes = [
        "retailer",
        "supplier",
        "logistics",
        "educational",
        "other",
      ];
      if (!validPartnerTypes.includes(partnershipData.partnerType)) {
        throw new AppError(
          `Invalid partner type. Must be one of: ${validPartnerTypes.join(
            ", "
          )}`,
          400
        );
      }

      const partnership = await this.schoolRepository.createPartnership(
        schoolId,
        partnershipData
      );

      logger.info(`Partnership created for school: ${schoolId}`, {
        partnerId: partnership.id,
        partnerName: partnershipData.partnerName,
      });

      return partnership;
    } catch (error) {
      logger.error("Error creating school partnership:", error);
      throw error;
    }
  }

  /**
   * Deactivate school (soft delete)
   */
  async deactivateSchool(schoolId, reason = null) {
    try {
      const school = await this.schoolRepository.findById(schoolId);
      if (!school) {
        throw new AppError("School not found", 404);
      }

      if (!school.isActive) {
        throw new AppError("School is already deactivated", 400);
      }

      await this.schoolRepository.deactivate(schoolId, reason);

      logger.info(`School deactivated: ${schoolId}`, { reason });
      return { message: "School deactivated successfully" };
    } catch (error) {
      logger.error("Error deactivating school:", error);
      throw error;
    }
  }

  /**
   * Reactivate school
   */
  async reactivateSchool(schoolId) {
    try {
      const school = await this.schoolRepository.findById(schoolId);
      if (!school) {
        throw new AppError("School not found", 404);
      }

      if (school.isActive) {
        throw new AppError("School is already active", 400);
      }

      await this.schoolRepository.reactivate(schoolId);

      logger.info(`School reactivated: ${schoolId}`);
      return { message: "School reactivated successfully" };
    } catch (error) {
      logger.error("Error reactivating school:", error);
      throw error;
    }
  }

  /**
   * Get school product catalog with pricing
   */
  async getSchoolCatalog(schoolId, filters = {}) {
    try {
      const school = await this.schoolRepository.findById(schoolId);
      if (!school || !school.isActive) {
        throw new AppError("School not found or inactive", 404);
      }

      const catalogFilters = {
        ...filters,
        page: Math.max(1, parseInt(filters.page) || 1),
        limit: Math.min(100, Math.max(1, parseInt(filters.limit) || 20)),
      };

      // console.log("Fetching catalog for school ID:", schoolId, "with filters:", catalogFilters);

      return await this.schoolRepository.getSchoolCatalog(
        schoolId,
        catalogFilters
      );
    } catch (error) {
      logger.error("Error getting school catalog:", error);
      throw error;
    }
  }

  /**
   * Bulk import schools from CSV data
   */
  async bulkImportSchools(schoolsData, adminUserId) {
    try {
      if (!Array.isArray(schoolsData) || schoolsData.length === 0) {
        throw new AppError("Schools data array is required", 400);
      }

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const schoolData of schoolsData) {
        try {
          const school = await this.createSchool(schoolData);
          results.push({
            success: true,
            school: { id: school.id, name: school.name },
            data: schoolData,
          });
          successCount++;
        } catch (error) {
          results.push({
            success: false,
            error: error.message,
            data: schoolData,
          });
          failureCount++;
        }
      }

      logger.info("Bulk school import completed", {
        total: schoolsData.length,
        successful: successCount,
        failed: failureCount,
        adminUserId,
      });

      return {
        results,
        summary: {
          total: schoolsData.length,
          successful: successCount,
          failed: failureCount,
        },
      };
    } catch (error) {
      logger.error("Error in bulk school import:", error);
      throw error;
    }
  }
}

export default SchoolService;
