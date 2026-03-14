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
            const supabase = this.getClient(token);

            const { data: warehouses, error } = await supabase
                .from("retailer_warehouse")
                .select(`
          warehouse:warehouse_id (
            id, name, contact_email, contact_phone, address, website, is_verified, metadata, created_at
          )
        `)
                .eq("retailer_id", retailerId);

            if (error) throw error;

            // Extract warehouse data from join result
            const warehouseList = warehouses.map((item) => item.warehouse).filter(Boolean);

            // Resolve address IDs to full address data
            const addressIds = warehouseList
                .map((w) => w.address)
                .filter((addr) => addr && typeof addr === "string");

            if (addressIds.length > 0) {
                const { data: addresses, error: addrError } = await supabase
                    .from("addresses")
                    .select("*")
                    .in("id", addressIds);

                if (!addrError && addresses) {
                    const addressMap = {};
                    addresses.forEach((addr) => {
                        addressMap[addr.id] = addr;
                    });

                    warehouseList.forEach((w) => {
                        if (w.address && typeof w.address === "string" && addressMap[w.address]) {
                            w.address = addressMap[w.address];
                        }
                    });
                }
            }

            return warehouseList;
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
     * Find warehouse by ID with Retailer info
     */
    async findByIdWithRetailer(id) {
        try {
            const supabase = getSupabase();

            // 1. Get warehouse details
            const { data: warehouse, error: warehouseError } = await supabase
                .from("warehouse")
                .select("*")
                .eq("id", id)
                .single();

            if (warehouseError) throw warehouseError;

            // 1.5 Get Address details if exists
            let addressData = warehouse.address;
            if (warehouse.address && typeof warehouse.address === 'string') {
                const { data: addr, error: addrError } = await supabase
                    .from("addresses")
                    .select("*")
                    .eq("id", warehouse.address)
                    .single();

                if (!addrError && addr) {
                    addressData = addr;
                }
            }

            // 2. Get linked retailer
            const { data: link, error: linkError } = await supabase
                .from("retailer_warehouse")
                .select("retailer_id")
                .eq("warehouse_id", id)
                .single();

            if (linkError && linkError.code !== "PGRST116") throw linkError;

            let retailer = null;
            if (link) {
                // 3. Get retailer user details
                const { data: userData, error: userError } = await supabase
                    .from("users")
                    .select("id, full_name, email, phone, role, is_active")
                    .eq("id", link.retailer_id)
                    .single();

                if (userError && userError.code !== "PGRST116") throw userError;
                retailer = userData;
            }

            return {
                ...warehouse,
                address: addressData,
                retailer
            };
        } catch (error) {
            logger.error("Error finding warehouse with retailer by ID:", error);
            throw error;
        }
    }
    /**
     * Update warehouse details
     */
    async update(id, updates) {
        try {
            const supabase = getSupabase();

            // Handle inline address object
            if (updates.addressData) {
                const addrInput = updates.addressData;
                const addressPayload = {
                    line1: addrInput.line1,
                    line2: addrInput.line2,
                    city: addrInput.city,
                    state: addrInput.state,
                    postal_code: addrInput.postalCode || addrInput.postal_code || addrInput.pincode,
                    country: addrInput.country || "India",
                    lat: addrInput.lat,
                    lng: addrInput.lng,
                };

                // Get the warehouse's current address ID
                const { data: existing } = await supabase
                    .from("warehouse")
                    .select("address")
                    .eq("id", id)
                    .single();

                if (existing?.address) {
                    // Update the existing address row
                    const { error: addrUpdateErr } = await supabase
                        .from("addresses")
                        .update(addressPayload)
                        .eq("id", existing.address);

                    if (addrUpdateErr) throw addrUpdateErr;
                } else {
                    // No existing address — create a new one and link it
                    const { data: newAddr, error: addrInsertErr } = await supabase
                        .from("addresses")
                        .insert({ ...addressPayload, label: "Warehouse Address", is_active: true })
                        .select("id")
                        .single();

                    if (addrInsertErr) throw addrInsertErr;
                    updates.address = newAddr.id;
                }

                // Remove addressData before sending to warehouse table
                delete updates.addressData;
            }

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

            logger.info("isLinkedToRetailer: checking", { retailerId, warehouseId });


            const { data, error } = await supabase
                .from("retailer_warehouse")
                .select("retailer_id,warehouse_id")
                .eq("retailer_id", retailerId)
                .eq("warehouse_id", warehouseId)
                .single();

            logger.info("isLinkedToRetailer: query result", { data, error });

            return !!data;
        } catch (error) {
            logger.error("Error checking warehouse ownership:", error);
            throw error;
        }
    }
    /**
     * Get warehouses with shipped orders, grouping by warehouse and including retailer info
     */
    async getWarehousesWithShippedOrders(token) {
        try {
            const supabase = this.getClient(token);

            // 1. Get all order items with status 'shipped'
            // We count items instead of unique orders to match the bifurcated logic of the retailer portal
            const { data: shippedItems, error: itemsError } = await supabase
                .from("order_items")
                .select("id, warehouse_id")
                .eq("status", "shipped");

            if (itemsError) throw itemsError;

            if (!shippedItems || shippedItems.length === 0) {
                return [];
            }

            // Group by warehouse_id and count items
            const warehouseCounts = {};
            shippedItems.forEach(item => {
                if (item.warehouse_id) {
                    warehouseCounts[item.warehouse_id] = (warehouseCounts[item.warehouse_id] || 0) + 1;
                }
            });

            const warehouseIds = Object.keys(warehouseCounts);

            if (warehouseIds.length === 0) return [];

            // 2. Get warehouse details for these warehouseIds
            const { data: warehouses, error: warehouseError } = await supabase
                .from("warehouse")
                .select("*")
                .in("id", warehouseIds);
            
            if (warehouseError) throw warehouseError;

            if (!warehouses || warehouses.length === 0) return [];

            // 3. Resolve addresses and retailer info
            const addressIds = warehouses
                .map(w => w.address)
                .filter(addr => addr && typeof addr === 'string');

            let addressMap = {};
            if (addressIds.length > 0) {
                const { data: addresses, error: addrError } = await supabase
                    .from("addresses")
                    .select("*")
                    .in("id", addressIds);
                
                if (!addrError && addresses) {
                    addresses.forEach(addr => {
                        addressMap[addr.id] = addr;
                    });
                }
            }

            // Get retailers
            const { data: retailerLinks, error: linkError } = await supabase
                .from("retailer_warehouse")
                .select("warehouse_id, retailer_id")
                .in("warehouse_id", warehouseIds);
            
            let retailerMap = {};
            if (!linkError && retailerLinks && retailerLinks.length > 0) {
                const retailerIds = retailerLinks.map(l => l.retailer_id);
                // Uniquify retailer IDs
                const uniqueRetailerIds = [...new Set(retailerIds)];
                
                const { data: retailers, error: userError } = await supabase
                    .from("users")
                    .select("id, full_name")
                    .in("id", uniqueRetailerIds);
                
                if (!userError && retailers) {
                    const userMap = {};
                    retailers.forEach(r => userMap[r.id] = r.full_name);
                    retailerLinks.forEach(l => {
                        retailerMap[l.warehouse_id] = userMap[l.retailer_id];
                    });
                }
            }

            // Format response
            const result = warehouses.map(w => {
                const address = (w.address && typeof w.address === 'string') 
                    ? addressMap[w.address] 
                    : w.address || {};
                
                let location = "";
                if (address.line1) {
                    location = [address.line1, address.line2, address.city, address.state, address.postal_code || address.postalCode]
                        .filter(Boolean)
                        .join(", ");
                }

                return {
                    warehouseId: w.id,
                    retailerName: retailerMap[w.id] || "Unknown Retailer",
                    warehouseName: w.name,
                    location: location || "Address not available",
                    lat: address.lat ? parseFloat(address.lat) : null,
                    lng: address.lng ? parseFloat(address.lng) : null,
                    shippedOrdersCount: warehouseCounts[w.id] || 0
                };
            });

            return result;
        } catch (error) {
            logger.error("Error getting warehouses with shipped orders:", error);
            throw error;
        }
    }

    /**
     * Used for order routing and splitting
     */
    async getWarehouseIdsByProductIds(productIds) {
        try {
            if (!productIds || productIds.length === 0) return new Map();

            const supabase = getSupabase();

            // Query products_warehouse to get mapping
            // Note: A product might be in multiple warehouses. 
            // For now, we'll pick the first one found or based on some logic.
            // The current requirement seems to be just getting *a* warehouse for the product.
            const { data, error } = await supabase
                .from("products_warehouse")
                .select("product_id, warehouse_id")
                .in("product_id", productIds);

            if (error) throw error;

            const warehouseMap = new Map();

            if (data) {
                // Populate map. If a product has multiple warehouses, this simply takes the last one seen.
                // TODO: Implement smarter warehouse selection logic (e.g., closest to user, highest stock)
                data.forEach(item => {
                    warehouseMap.set(item.product_id, item.warehouse_id);
                });
            }

            return warehouseMap;
        } catch (error) {
            logger.error("Error getting warehouse IDs by product IDs:", error);
            // Don't throw, just return empty map to allow default warehouse fallback if applicable
            return new Map();
        }
    }
}

export default new WarehouseRepository();
