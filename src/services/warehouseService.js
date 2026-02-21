import warehouseRepository from "../repositories/warehouseRepository.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

class WarehouseService {
    /**
     * Add a new warehouse for a retailer
     */
    async addWarehouse(warehouseData, retailerId, token) {
        try {
            // Validate required fields
            if (!warehouseData.name) {
                throw new AppError("Warehouse name is required", 400);
            }

            // Create warehouse
            const warehouse = await warehouseRepository.create(warehouseData, token);
            logger.info("Warehouse created", { warehouseId: warehouse.id });

            // Link to retailer if retailerId is provided
            if (retailerId) {
                await warehouseRepository.linkToRetailer(retailerId, warehouse.id, token);
                logger.info("Warehouse linked to retailer", {
                    warehouseId: warehouse.id,
                    retailerId,
                });
            }

            return warehouse;
        } catch (error) {
            logger.error("Error in addWarehouse service:", error);
            throw error;
        }
    }

    /**
     * Get all warehouses for a retailer
     */
    async getMyWarehouses(retailerId, token) {
        try {
            if (!retailerId) {
                throw new AppError("Retailer ID is required", 400);
            }

            const warehouses = await warehouseRepository.findByRetailerId(retailerId, token);
            return warehouses;
        } catch (error) {
            logger.error("Error in getMyWarehouses service:", error);
            throw error;
        }
    }

    /**
     * Get warehouses for a specific retailer (Admin use)
     * @param {string} retailerId - Target retailer ID
     * @param {string} token - Auth token
     * @returns {Promise<Array>} List of warehouses
     */
    async getWarehousesByRetailer(retailerId, token) {
        try {
            if (!retailerId) {
                throw new AppError("Retailer ID is required", 400);
            }
            return await warehouseRepository.findByRetailerId(retailerId, token);
        } catch (error) {
            logger.error("Error in getWarehousesByRetailer service:", error);
            throw error;
        }
    }

    /**
     * Get warehouse by ID
     */
    async getWarehouseById(id) {
        try {
            const warehouse = await warehouseRepository.findByIdWithRetailer(id);
            if (!warehouse) {
                throw new AppError("Warehouse not found", 404);
            }
            return warehouse;
        } catch (error) {
            logger.error("Error in getWarehouseById service:", error);
            throw error;
        }
    }
    /**
     * Update warehouse details
     */
    async updateWarehouse(id, updates, retailerId) {
        try {
            // Check ownership
            const isLinked = await warehouseRepository.isLinkedToRetailer(
                retailerId,
                id
            );
            if (!isLinked) {
                throw new AppError(
                    "Access denied. You do not own this warehouse.",
                    403
                );
            }

            // Prepare updates (sanitize)
            const allowedUpdates = {};
            if (updates.name) allowedUpdates.name = updates.name;
            if (updates.contactEmail) allowedUpdates.contact_email = updates.contactEmail;
            if (updates.contactPhone) allowedUpdates.contact_phone = updates.contactPhone;
            if (updates.address && typeof updates.address === 'object') {
                allowedUpdates.addressData = updates.address;
            } else if (updates.address) {
                allowedUpdates.address = updates.address;
            }
            if (updates.website) allowedUpdates.website = updates.website;
            if (updates.metadata) allowedUpdates.metadata = updates.metadata;

            const warehouse = await warehouseRepository.update(id, allowedUpdates);
            logger.info("Warehouse updated", { warehouseId: id, retailerId });

            return warehouse;
        } catch (error) {
            logger.error("Error in updateWarehouse service:", error);
            throw error;
        }
    }

    /**
     * Delete warehouse
     */
    async deleteWarehouse(id, retailerId) {
        try {
            // Check ownership
            const isLinked = await warehouseRepository.isLinkedToRetailer(
                retailerId,
                id
            );
            if (!isLinked) {
                throw new AppError(
                    "Access denied. You do not own this warehouse.",
                    403
                );
            }

            // TODO: Check for active products linked to this warehouse before deleting?
            // For now, depending on DB constraints, it might fail if products exist.
            // We'll let the DB constraint throw if foreign keys exist.

            await warehouseRepository.delete(id);
            logger.info("Warehouse deleted", { warehouseId: id, retailerId });

            return true;
        } catch (error) {
            logger.error("Error in deleteWarehouse service:", error);
            throw error;
        }
    }

    /**
     * Update warehouse details (Admin)
     */
    async updateWarehouseByAdmin(id, updates) {
        try {
            // No ownership check needed for admin
            // Prepare updates (sanitize)
            const allowedUpdates = {};
            if (updates.name) allowedUpdates.name = updates.name;
            if (updates.contactEmail) allowedUpdates.contact_email = updates.contactEmail;
            if (updates.contactPhone) allowedUpdates.contact_phone = updates.contactPhone;
            if (updates.address && typeof updates.address === 'object') {
                allowedUpdates.addressData = updates.address;
            } else if (updates.address) {
                allowedUpdates.address = updates.address;
            }
            if (updates.website) allowedUpdates.website = updates.website;
            if (updates.metadata) allowedUpdates.metadata = updates.metadata;
            if (updates.isVerified !== undefined) allowedUpdates.is_verified = updates.isVerified;

            const warehouse = await warehouseRepository.update(id, allowedUpdates);
            logger.info("Warehouse updated by admin", { warehouseId: id });

            return warehouse;
        } catch (error) {
            logger.error("Error in updateWarehouseByAdmin service:", error);
            throw error;
        }
    }

    /**
     * Delete warehouse (Admin)
     */
    async deleteWarehouseByAdmin(id) {
        try {
            // No ownership check needed for admin
            await warehouseRepository.delete(id);
            logger.info("Warehouse deleted by admin", { warehouseId: id });

            return true;
        } catch (error) {
            logger.error("Error in deleteWarehouseByAdmin service:", error);
            throw error;
        }
    }
}

export default new WarehouseService();
