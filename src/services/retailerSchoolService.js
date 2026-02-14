import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";
import { RetailerSchoolRepository } from "../repositories/retailerSchoolRepository.js";

const VALID_STATUSES = ["approved", "pending", "rejected"];

/**
 * Retailer School Service
 * Handles business logic for linking retailers to schools
 */
export class RetailerSchoolService {
    constructor() {
        this.retailerSchoolRepo = new RetailerSchoolRepository(getSupabase());
    }

    /**
     * Link a retailer to a school
     * @param {Object} params - { retailerId, schoolId, status?, productType? }
     * @returns {Object} Created retailer-school link
     */
    async linkRetailerToSchool({ retailerId, schoolId, status = "pending", productType = [] }) {
        try {
            if (!retailerId || !schoolId) {
                throw new AppError("retailerId and schoolId are required", 400);
            }

            if (!VALID_STATUSES.includes(status)) {
                throw new AppError(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
            }

            if (!Array.isArray(productType)) {
                throw new AppError("productType must be an array", 400);
            }

            const supabase = getSupabase();

            // Verify retailer exists
            const { data: retailer, error: retailerError } = await supabase
                .from("users")
                .select("id, role")
                .eq("id", retailerId)
                .single();

            if (retailerError || !retailer) {
                throw new AppError("Retailer not found", 404);
            }

            if (retailer.role !== "retailer") {
                throw new AppError("User is not a retailer", 403);
            }

            // Verify school exists
            const { data: school, error: schoolError } = await supabase
                .from("schools")
                .select("id")
                .eq("id", schoolId)
                .single();

            if (schoolError || !school) {
                throw new AppError("School not found", 404);
            }

            // Check if exact composite key already exists
            const existing = await this.retailerSchoolRepo.findByCompositeKey(retailerId, schoolId, status);
            if (existing) {
                throw new AppError(`Retailer is already linked to this school with status '${status}'`, 409);
            }

            const record = await this.retailerSchoolRepo.create({
                retailerId,
                schoolId,
                status,
                productType,
            });

            return {
                message: "Retailer linked to school successfully",
                retailerSchool: record,
            };
        } catch (error) {
            logger.error("linkRetailerToSchool error:", error);
            throw error;
        }
    }

    /**
     * Get all schools connected to a retailer, with full school info
     * @param {string} retailerId
     * @param {Object} filters - { status? }
     * @returns {Object} { retailerId, totalSchools, schools }
     */
    async getConnectedSchools(retailerId, filters = {}) {
        try {
            if (!retailerId) {
                throw new AppError("retailerId is required", 400);
            }

            if (filters.status && !VALID_STATUSES.includes(filters.status)) {
                throw new AppError(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
            }

            const supabase = getSupabase();

            // Verify retailer exists
            const { data: retailer, error: retailerError } = await supabase
                .from("users")
                .select("id")
                .eq("id", retailerId)
                .single();

            if (retailerError || !retailer) {
                throw new AppError("Retailer not found", 404);
            }

            const records = await this.retailerSchoolRepo.findByRetailerId(retailerId, filters);

            return {
                retailerId,
                totalSchools: records.length,
                schools: records.map((record) => ({
                    retailerId: record.retailer_id,
                    schoolId: record.school_id,
                    status: record.status,
                    productType: record.product_type,
                    linkedAt: record.created_at,
                    updatedAt: record.updated_at,
                    school: record.schools, // full school info from Supabase join
                })),
            };
        } catch (error) {
            logger.error("getConnectedSchools error:", error);
            throw error;
        }
    }

    /**
     * Get all retailers connected to a school
     * @param {string} schoolId
     * @param {Object} filters - { status? }
     * @returns {Object} { schoolId, totalRetailers, retailers }
     */
    async getConnectedRetailers(schoolId, filters = {}) {
        try {
            if (!schoolId) {
                throw new AppError("schoolId is required", 400);
            }

            if (filters.status && !VALID_STATUSES.includes(filters.status)) {
                throw new AppError(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
            }

            const records = await this.retailerSchoolRepo.findBySchoolId(schoolId, filters);

            return {
                schoolId,
                totalRetailers: records.length,
                retailers: records.map((record) => ({
                    retailerId: record.retailer_id,
                    schoolId: record.school_id,
                    status: record.status,
                    productType: record.product_type,
                    linkedAt: record.created_at,
                    updatedAt: record.updated_at,
                    retailer: record.users,
                })),
            };
        } catch (error) {
            logger.error("getConnectedRetailers error:", error);
            throw error;
        }
    }

    /**
     * Update link status (since status is part of PK, does delete + insert)
     * @param {string} retailerId
     * @param {string} schoolId
     * @param {string} currentStatus
     * @param {string} newStatus
     * @returns {Object}
     */
    async updateLinkStatus(retailerId, schoolId, currentStatus, newStatus) {
        try {
            if (!retailerId || !schoolId || !currentStatus || !newStatus) {
                throw new AppError("retailerId, schoolId, currentStatus, and newStatus are required", 400);
            }

            if (!VALID_STATUSES.includes(currentStatus) || !VALID_STATUSES.includes(newStatus)) {
                throw new AppError(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
            }

            if (currentStatus === newStatus) {
                throw new AppError("New status must be different from current status", 400);
            }

            const updated = await this.retailerSchoolRepo.updateStatus(retailerId, schoolId, currentStatus, newStatus);

            return {
                message: `Link status updated from '${currentStatus}' to '${newStatus}'`,
                retailerSchool: updated,
            };
        } catch (error) {
            logger.error("updateLinkStatus error:", error);
            throw error;
        }
    }

    /**
     * Update product types for a retailer-school link
     * @param {string} retailerId
     * @param {string} schoolId
     * @param {string} status
     * @param {Array} productType
     * @returns {Object}
     */
    async updateProductType(retailerId, schoolId, status, productType) {
        try {
            if (!retailerId || !schoolId || !status) {
                throw new AppError("retailerId, schoolId, and status are required", 400);
            }

            if (!Array.isArray(productType)) {
                throw new AppError("productType must be an array", 400);
            }

            const updated = await this.retailerSchoolRepo.updateProductType(retailerId, schoolId, status, productType);

            return {
                message: "Product type updated successfully",
                retailerSchool: updated,
            };
        } catch (error) {
            logger.error("updateProductType error:", error);
            throw error;
        }
    }

    /**
     * Unlink a retailer from a school
     * @param {string} retailerId
     * @param {string} schoolId
     * @param {string} status
     * @returns {Object}
     */
    async unlinkRetailerFromSchool(retailerId, schoolId, status) {
        try {
            if (!retailerId || !schoolId || !status) {
                throw new AppError("retailerId, schoolId, and status are required", 400);
            }

            await this.retailerSchoolRepo.deleteByCompositeKey(retailerId, schoolId, status);

            return { message: "Retailer unlinked from school successfully" };
        } catch (error) {
            logger.error("unlinkRetailerFromSchool error:", error);
            throw error;
        }
    }
}

export const retailerSchoolService = new RetailerSchoolService();
