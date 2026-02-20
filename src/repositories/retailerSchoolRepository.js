import { logger } from "../utils/logger.js";

/**
 * Retailer School Repository
 * Handles all retailer_schools table operations using Supabase
 * Composite PK: (retailer_id, school_id, status)
 */
export class RetailerSchoolRepository {
    constructor(supabase) {
        this.supabase = supabase;
        this.tableName = "retailer_schools";
    }

    /**
     * Create a new retailer-school link
     * @param {Object} data - { retailerId, schoolId, status, productType }
     * @returns {Object} Created record
     */
    async create(data) {
        const { retailerId, schoolId, status = "pending", productType = [], warehouseId } = data;

        const record = {
            retailer_id: retailerId,
            school_id: schoolId,
            status,
            product_type: productType,
            warehouse_id: warehouseId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { data: inserted, error } = await this.supabase
            .from(this.tableName)
            .insert(record)
            .select("*")
            .single();

        if (error) {
            logger.error("RetailerSchoolRepository.create error:", error);
            throw error;
        }

        return inserted;
    }

    /**
     * Find by composite primary key
     * @param {string} retailerId
     * @param {string} schoolId
     * @param {string} status
     * @returns {Object|null}
     */
    async findByCompositeKey(retailerId, schoolId, status) {
        const { data, error } = await this.supabase
            .from(this.tableName)
            .select("*")
            .eq("retailer_id", retailerId)
            .eq("school_id", schoolId)
            .eq("status", status)
            .single();

        if (error && error.code !== "PGRST116") {
            logger.error("RetailerSchoolRepository.findByCompositeKey error:", error);
            throw error;
        }

        return data || null;
    }

    /**
     * Find all links for a retailer-school pair (any status)
     * @param {string} retailerId
     * @param {string} schoolId
     * @returns {Array}
     */
    async findByRetailerAndSchool(retailerId, schoolId) {
        const { data, error } = await this.supabase
            .from(this.tableName)
            .select("*")
            .eq("retailer_id", retailerId)
            .eq("school_id", schoolId);

        if (error) {
            logger.error("RetailerSchoolRepository.findByRetailerAndSchool error:", error);
            throw error;
        }

        return data || [];
    }

    /**
     * Get all schools connected to a retailer with full school info
     * @param {string} retailerId
     * @param {Object} filters - { status }
     * @returns {Array}
     */
    async findByRetailerId(retailerId, filters = {}) {
        let query = this.supabase
            .from(this.tableName)
            .select(`
                retailer_id, school_id, status, product_type, warehouse_id, created_at, updated_at,
                schools (*),
                warehouse!retailer_schools_warehouse_id_fkey (*)
            `)
            .eq("retailer_id", retailerId);

        if (filters.status) {
            query = query.eq("status", filters.status);
        }

        query = query.order("created_at", { ascending: false });

        const { data, error } = await query;

        if (error) {
            logger.error("RetailerSchoolRepository.findByRetailerId error:", error);
            throw error;
        }

        return data || [];
    }

    /**
     * Get all retailers connected to a school
     * @param {string} schoolId
     * @param {Object} filters - { status }
     * @returns {Array}
     */
    async findBySchoolId(schoolId, filters = {}) {
        let query = this.supabase
            .from(this.tableName)
            .select(`
                retailer_id, school_id, status, product_type, warehouse_id, created_at, updated_at,
                users!retailer_id (id, full_name, email, phone),
                warehouse!retailer_schools_warehouse_id_fkey (*)
            `)
            .eq("school_id", schoolId);

        if (filters.status) {
            query = query.eq("status", filters.status);
        }

        query = query.order("created_at", { ascending: false });

        const { data, error } = await query;

        if (error) {
            logger.error("RetailerSchoolRepository.findBySchoolId error:", error);
            throw error;
        }

        return data || [];
    }

    /**
     * Update status — since status is part of PK, delete old + insert new
     * @param {string} retailerId
     * @param {string} schoolId
     * @param {string} currentStatus
     * @param {string} newStatus
     * @returns {Object} New record
     */
    async updateStatus(retailerId, schoolId, currentStatus, newStatus) {
        // 1. Fetch the existing record
        const existing = await this.findByCompositeKey(retailerId, schoolId, currentStatus);
        if (!existing) {
            throw new Error("Retailer-school link not found");
        }

        // 2. Delete old record (old PK)
        const { error: deleteError } = await this.supabase
            .from(this.tableName)
            .delete()
            .eq("retailer_id", retailerId)
            .eq("school_id", schoolId)
            .eq("status", currentStatus);

        if (deleteError) {
            logger.error("RetailerSchoolRepository.updateStatus delete error:", deleteError);
            throw deleteError;
        }

        // 3. Insert new record with updated status
        const newRecord = {
            retailer_id: retailerId,
            school_id: schoolId,
            status: newStatus,
            product_type: existing.product_type,
            warehouse_id: existing.warehouse_id,
            created_at: existing.created_at,
            updated_at: new Date().toISOString(),
        };

        const { data: inserted, error: insertError } = await this.supabase
            .from(this.tableName)
            .insert(newRecord)
            .select("*")
            .single();

        if (insertError) {
            logger.error("RetailerSchoolRepository.updateStatus insert error:", insertError);
            throw insertError;
        }

        return inserted;
    }

    /**
     * Update product_type for a link (product_type is not part of PK, simple update)
     * @param {string} retailerId
     * @param {string} schoolId
     * @param {string} status
     * @param {Array} productType
     * @returns {Object} Updated record
     */
    async updateProductType(retailerId, schoolId, status, productType) {
        const { data, error } = await this.supabase
            .from(this.tableName)
            .update({
                product_type: productType,
                updated_at: new Date().toISOString(),
            })
            .eq("retailer_id", retailerId)
            .eq("school_id", schoolId)
            .eq("status", status)
            .select("*")
            .single();

        if (error) {
            logger.error("RetailerSchoolRepository.updateProductType error:", error);
            throw error;
        }

        return data;
    }

    /**
     * Delete by composite PK
     * @param {string} retailerId
     * @param {string} schoolId
     * @param {string} status
     * @returns {boolean}
     */
    async deleteByCompositeKey(retailerId, schoolId, status) {
        const { error } = await this.supabase
            .from(this.tableName)
            .delete()
            .eq("retailer_id", retailerId)
            .eq("school_id", schoolId)
            .eq("status", status);

        if (error) {
            logger.error("RetailerSchoolRepository.deleteByCompositeKey error:", error);
            throw error;
        }

        return true;
    }

    /**
     * Delete all links between a retailer and a school (any status)
     * @param {string} retailerId
     * @param {string} schoolId
     * @returns {boolean}
     */
    async deleteAllByRetailerAndSchool(retailerId, schoolId) {
        const { error } = await this.supabase
            .from(this.tableName)
            .delete()
            .eq("retailer_id", retailerId)
            .eq("school_id", schoolId);

        if (error) {
            logger.error("RetailerSchoolRepository.deleteAllByRetailerAndSchool error:", error);
            throw error;
        }

        return true;
    }
}
