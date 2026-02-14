import { logger } from "../utils/logger.js";

/**
 * Retailer Repository
 * Handles all retailer-related database operations using Supabase
 */
export class RetailerRepository {
    constructor(supabase) {
        this.supabase = supabase;
        this.tableName = "retailer_data";
    }

    /**
     * Create or update retailer data
     * @param {Object} data - Retailer data
     * @returns {Object} Created/Updated retailer data
     */
    async createOrUpdate(data) {
        try {
            // Map camelCase to snake_case for database columns
            const dbData = {
                retailer_id: data.retailerId,
                display_name: data.displayName,
                owner_name: data.ownerName,
                gstin: data.gstin,
                pan: data.pan,
                signature_url: data.signatureUrl,
                updated_at: new Date().toISOString(),
            };

            const { data: result, error } = await this.supabase
                .from(this.tableName)
                .upsert(dbData, { onConflict: "retailer_id" })
                .select()
                .single();

            if (error) throw error;

            return this.formatRetailer(result);
        } catch (error) {
            logger.error("Error creating/updating retailer data:", error);
            throw error;
        }
    }

    /**
     * Find retailer by ID
     * @param {string} retailerId - Retailer ID (User ID)
     * @returns {Object} Retailer data
     */
    async findById(retailerId) {
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select("*")
                .eq("retailer_id", retailerId)
                .single();

            if (error) {
                if (error.code === "PGRST116") return null; // No rows found
                throw error;
            }

            return this.formatRetailer(data);
        } catch (error) {
            logger.error("Error finding retailer by ID:", error);
            throw error;
        }
    }

    /**
     * Format retailer object for response
     */
    formatRetailer(row) {
        if (!row) return null;

        return {
            retailerId: row.retailer_id,
            displayName: row.display_name,
            ownerName: row.owner_name,
            gstin: row.gstin,
            pan: row.pan,
            signatureUrl: row.signature_url,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

export default RetailerRepository;
