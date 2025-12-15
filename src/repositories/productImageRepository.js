import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Product Image Repository
 * Handles all product image-related database operations with Supabase
 */
export class ProductImageRepository {
  /**
   * Get images for a product with optional variant filtering
   * @param {string} productId - Product ID
   * @param {string|null} variantId - Optional variant ID to filter images
   * @returns {Promise<Array>} Array of product images
   */
  async getProductImages(productId, variantId = null) {
    try {
      const supabase = getSupabase();

      let query = supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId);

      // If variantId is provided, filter by variant
      if (variantId) {
        query = query.eq("variant_id", variantId);
      }

      // Order by sort_order and created_at
      query = query.order("sort_order").order("created_at");

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((image) => this.formatImage(image));
    } catch (error) {
      logger.error("Error getting product images:", error);
      throw error;
    }
  }

  /**
   * Get a single image by ID
   * @param {string} imageId - Image ID
   * @returns {Promise<Object|null>} Image object or null
   */
  async findById(imageId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_images")
        .select("*")
        .eq("id", imageId)
        .single();

      if (error && error.code === "PGRST116") return null;
      if (error) throw error;

      return data ? this.formatImage(data) : null;
    } catch (error) {
      logger.error("Error finding image by ID:", error);
      throw error;
    }
  }

  /**
   * Create a new product image
   * @param {Object} imageData - Image data
   * @returns {Promise<Object>} Created image
   */
  async create(imageData) {
    try {
      const supabase = getSupabase();

      const payload = {
        product_id: imageData.productId,
        variant_id: imageData.variantId || null,
        url: imageData.url,
        alt_text: imageData.altText || null,
        sort_order: imageData.sortOrder || 0,
        is_primary: imageData.isPrimary || false,
      };

      const { data, error } = await supabase
        .from("product_images")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      return this.formatImage(data);
    } catch (error) {
      logger.error("Error creating product image:", error);
      throw error;
    }
  }

  /**
   * Update an existing product image
   * @param {string} imageId - Image ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated image
   */
  async update(imageId, updateData) {
    try {
      const supabase = getSupabase();

      const updatePayload = {};

      if (updateData.url !== undefined) updatePayload.url = updateData.url;
      if (updateData.altText !== undefined)
        updatePayload.alt_text = updateData.altText;
      if (updateData.sortOrder !== undefined)
        updatePayload.sort_order = updateData.sortOrder;
      if (updateData.isPrimary !== undefined)
        updatePayload.is_primary = updateData.isPrimary;

      if (Object.keys(updatePayload).length === 0) {
        return this.findById(imageId);
      }

      const { error } = await supabase
        .from("product_images")
        .update(updatePayload)
        .eq("id", imageId);

      if (error) throw error;

      return this.findById(imageId);
    } catch (error) {
      logger.error("Error updating product image:", error);
      throw error;
    }
  }

  /**
   * Delete a product image
   * @param {string} imageId - Image ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(imageId) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("product_images")
        .delete()
        .eq("id", imageId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deleting product image:", error);
      throw error;
    }
  }

  /**
   * Get primary image for a product
   * @param {string} productId - Product ID
   * @param {string|null} variantId - Optional variant ID
   * @returns {Promise<Object|null>} Primary image or null
   */
  async getPrimaryImage(productId, variantId = null) {
    try {
      const supabase = getSupabase();

      let query = supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .eq("is_primary", true);

      if (variantId) {
        query = query.eq("variant_id", variantId);
      }

      query = query.order("sort_order").limit(1);

      const { data, error } = await query;

      if (error) throw error;

      return data && data.length > 0 ? this.formatImage(data[0]) : null;
    } catch (error) {
      logger.error("Error getting primary image:", error);
      throw error;
    }
  }

  /**
   * Set primary image for a product/variant
   * @param {string} imageId - Image ID to set as primary
   * @param {string} productId - Product ID
   * @param {string|null} variantId - Optional variant ID
   * @returns {Promise<boolean>} Success status
   */
  async setPrimaryImage(imageId, productId, variantId = null) {
    try {
      const supabase = getSupabase();

      // First, unset all primary images for this product/variant
      let resetQuery = supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", productId);

      if (variantId) {
        resetQuery = resetQuery.eq("variant_id", variantId);
      }

      const { error: resetError } = await resetQuery;
      if (resetError) throw resetError;

      // Then set the specified image as primary
      const { error: setPrimaryError } = await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", imageId);

      if (setPrimaryError) throw setPrimaryError;

      return true;
    } catch (error) {
      logger.error("Error setting primary image:", error);
      throw error;
    }
  }

  /**
   * Format image object for response
   * @param {Object} row - Database row
   * @returns {Object} Formatted image object
   */
  formatImage(row) {
    if (!row) return null;

    return {
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      url: row.url,
      altText: row.alt_text,
      sortOrder: row.sort_order,
      isPrimary: Boolean(row.is_primary),
      createdAt: row.created_at,
    };
  }
}

export default new ProductImageRepository();
