import { getSupabase, createAuthenticatedClient } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Warehouse Repository
 * Handles all warehouse-related database operations with Supabase
 */
export class WarehouseRepository {
    /**
     * Get Supabase client (authenticated if token provided)
     */
    getClient(token) {
        if (token) return createAuthenticatedClient(token);
        return getSupabase();
    }
    /**
     * Create a new warehouse
     */
    async create(warehouseData, token) {
        try {
            const supabase = this.getClient(token);

            let addressId = warehouseData.address;

            // If address is an object (JSON), create it in addresses table first
            if (warehouseData.address && typeof warehouseData.address === 'object') {
                const addressPayload = {
                    label: "Warehouse Address",
                    recipient_name: warehouseData.name,
                    phone: warehouseData.contactPhone,
                    line1: warehouseData.address.line1,
                    line2: warehouseData.address.line2,
                    city: warehouseData.address.city,
                    state: warehouseData.address.state,
                    postal_code: warehouseData.address.postalCode || warehouseData.address.postal_code || warehouseData.address.pincode,
                    country: warehouseData.address.country || "India",
                    lat: warehouseData.address.lat,
                    lng: warehouseData.address.lng,
                    is_active: true,
                    // valid user_id is needed if the schema enforces it, otherwise null. 
                    // Assuming null is allowed or we don't have user_id here. 
                    // If we have access to user/retailer id in context, we could use it, but create method only takes token.
                    // We will proceed with user_id: null if schema allows, or handle error. 
                    // Based on typical supabase patterns, if RLS is on, we might need a user_id. 
                    // But for now, let's assume loose coupling or trigger based.
                };

                const { data: newAddress, error: addressError } = await supabase
                    .from("addresses")
                    .insert(addressPayload)
                    .select("id")
                    .single();

                if (addressError) throw addressError;
                addressId = newAddress.id;
            }

            const warehousePayload = {
                name: warehouseData.name,
                contact_email: warehouseData.contactEmail,
                contact_phone: warehouseData.contactPhone,
                address: addressId,
                website: warehouseData.website,
                is_verified: warehouseData.isVerified || false,
                metadata: warehouseData.metadata || {},
            };

            const { data: warehouse, error } = await supabase
                .from("warehouse")
                .insert(warehousePayload)
                .select()
                .single();

            if (error) throw error;

            return warehouse;
        } catch (error) {
            logger.error("Error creating warehouse:", error);
            throw error;
        }
    }

    /**
     * Link a warehouse to a retailer
     */
    async linkToRetailer(retailerId, warehouseId, token) {
        try {
            const supabase = this.getClient(token);

            // Check if already linked
            const { data: existingLink } = await supabase
                .from("retailer_warehouse")
                .select("id")
                .eq("retailer_id", retailerId)
                .eq("warehouse_id", warehouseId)
                .single();

            if (existingLink) return existingLink;

            const { data: link, error } = await supabase
                .from("retailer_warehouse")
                .insert({
                    retailer_id: retailerId,
                    warehouse_id: warehouseId,
                })
                .select()
                .single();

            if (error) throw error;

            return link;
        } catch (error) {
            logger.error("Error linking warehouse to retailer:", error);
            throw error;
        }
    }

    /**
     * Find warehouses by retailer ID
     */
    async findByRetailerId(retailerId, token) {
        try {
            console.log("warehouse api called")
            const supabase = this.getClient(token);

            const { data: warehouses, error } = await supabase
                .from("retailer_warehouse")
                .select(`
          warehouse:warehouse_id (
            id, name, contact_email, contact_phone, address, website, is_verified, metadata, created_at
          )
        `)
                .eq("retailer_id", retailerId);

            console.log(retailerId)

            if (error) throw error;

            // Extract warehouse data from join result
            return warehouses.map((item) => item.warehouse).filter(Boolean);
        } catch (error) {
            logger.error("Error finding warehouses by retailer ID:", error);
            throw error;
        }
    }

    /**
     * Find warehouse by ID
     */
    async findById(id) {
        try {
            const supabase = getSupabase();

            const { data: warehouse, error } = await supabase
                .from("warehouse")
                .select("*")
                .eq("id", id)
                .single();

            if (error) throw error;

            return warehouse;
        } catch (error) {
            logger.error("Error finding warehouse by ID:", error);
            throw error;
        }
    }
    /**
     * Update warehouse details
     */
    async update(id, updates) {
        try {
            const supabase = getSupabase();

            const { data: warehouse, error } = await supabase
                .from("warehouse")
                .update(updates)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;

            return warehouse;
        } catch (error) {
            logger.error("Error updating warehouse:", error);
            throw error;
        }
    }

    /**
     * Delete warehouse (check for constraints first handled by DB or service)
     */
    async delete(id) {
        try {
            const supabase = getSupabase();

            const { error } = await supabase
                .from("warehouse")
                .delete()
                .eq("id", id);

            if (error) throw error;

            return true;
        } catch (error) {
            logger.error("Error deleting warehouse:", error);
            throw error;
        }
    }

    /**
     * Check if warehouse is linked to retailer
     */
    async isLinkedToRetailer(retailerId, warehouseId) {
        try {
            const supabase = getSupabase();

            const { data } = await supabase
                .from("retailer_warehouse")
                .select("id")
                .eq("retailer_id", retailerId)
                .eq("warehouse_id", warehouseId)
                .single();

            return !!data;
        } catch (error) {
            logger.error("Error checking warehouse ownership:", error);
            throw error;
        }
    }
}

export default new WarehouseRepository();
