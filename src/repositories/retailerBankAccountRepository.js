import { logger } from "../utils/logger.js";

/**
 * Retailer Bank Account Repository
 * Handles all bank-account-related database operations using Supabase
 */
export class RetailerBankAccountRepository {
    constructor(supabase) {
        this.supabase = supabase;
        this.tableName = "retailer_bank_accounts";
    }

    /**
     * Find all bank accounts for a retailer
     * @param {string} retailerId
     * @returns {Array} List of bank accounts
     */
    async findAllByRetailerId(retailerId) {
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select("*")
                .eq("retailer_id", retailerId)
                .order("is_primary", { ascending: false })
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error("Error finding bank accounts by retailer ID:", error);
            throw error;
        }
    }

    /**
     * Find a single bank account by ID
     * @param {string} id - Bank account UUID
     * @returns {Object|null}
     */
    async findById(id) {
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select("*")
                .eq("id", id)
                .single();

            if (error) {
                if (error.code === "PGRST116") return null;
                throw error;
            }
            return data;
        } catch (error) {
            logger.error("Error finding bank account by ID:", error);
            throw error;
        }
    }

    /**
     * Create a new bank account
     * @param {Object} data - snake_case DB row data
     * @returns {Object} Created row
     */
    async create(data) {
        try {
            const { data: result, error } = await this.supabase
                .from(this.tableName)
                .insert(data)
                .select()
                .single();

            if (error) throw error;
            return result;
        } catch (error) {
            logger.error("Error creating bank account:", error);
            throw error;
        }
    }

    /**
     * Update a bank account
     * @param {string} id - Bank account UUID
     * @param {Object} data - Fields to update (snake_case)
     * @returns {Object} Updated row
     */
    async update(id, data) {
        try {
            const { data: result, error } = await this.supabase
                .from(this.tableName)
                .update({ ...data, updated_at: new Date().toISOString() })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return result;
        } catch (error) {
            logger.error("Error updating bank account:", error);
            throw error;
        }
    }

    /**
     * Delete a bank account
     * @param {string} id - Bank account UUID
     * @returns {boolean}
     */
    async delete(id) {
        try {
            const { error } = await this.supabase
                .from(this.tableName)
                .delete()
                .eq("id", id);

            if (error) throw error;
            return true;
        } catch (error) {
            logger.error("Error deleting bank account:", error);
            throw error;
        }
    }

    /**
     * Unset the primary flag on all accounts for a retailer
     * @param {string} retailerId
     */
    async unsetAllPrimary(retailerId) {
        try {
            const { error } = await this.supabase
                .from(this.tableName)
                .update({ is_primary: false, updated_at: new Date().toISOString() })
                .eq("retailer_id", retailerId)
                .eq("is_primary", true);

            if (error) throw error;
        } catch (error) {
            logger.error("Error unsetting primary bank accounts:", error);
            throw error;
        }
    }

    /**
     * Set a specific account as primary
     * @param {string} id - Bank account UUID
     */
    async setPrimary(id) {
        try {
            const { data: result, error } = await this.supabase
                .from(this.tableName)
                .update({ is_primary: true, updated_at: new Date().toISOString() })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return result;
        } catch (error) {
            logger.error("Error setting bank account as primary:", error);
            throw error;
        }
    }
}

export default RetailerBankAccountRepository;
