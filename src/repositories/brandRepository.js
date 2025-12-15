import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Brand Repository
 * Handles all brand-related database operations with Supabase
 */
export class BrandRepository {
  /**
   * Map API field names (camelCase) to database column names (snake_case)
   */
  mapSortField(apiField) {
    const fieldMap = {
      createdAt: "created_at",
      updatedAt: "updated_at",
      name: "name", // already correct
    };

    return fieldMap[apiField] || apiField;
  }

  /**
   * Create a new brand
   */
  async create(brandData) {
    try {
      const supabase = getSupabase();

      const brandPayload = {
        name: brandData.name,
        slug: brandData.slug,
        description: brandData.description,
        country: brandData.country,
        logo_url: brandData.logoUrl || brandData.logo_url, // Handle both naming conventions
        metadata: brandData.metadata || {},
        is_active: true,
      };

      const { data: brand, error } = await supabase
        .from("brands")
        .insert(brandPayload)
        .select()
        .single();

      if (error) throw error;

      return this.formatBrand(brand);
    } catch (error) {
      logger.error("Error creating brand:", error);
      throw error;
    }
  }

  /**
   * Find brand by ID
   */
  async findById(brandId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .eq("id", brandId)
        .eq("is_active", true)
        .single();

      if (error && error.code === "PGRST116") return null;
      if (error) throw error;

      return data ? this.formatBrand(data) : null;
    } catch (error) {
      logger.error("Error finding brand by ID:", error);
      throw error;
    }
  }

  /**
   * Search brands
   */
  async search(filters = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase
        .from("brands")
        .select("*", { count: "exact" })
        .eq("is_active", true);

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      if (filters.country) {
        query = query.eq("country", filters.country);
      }

      // Sorting with field mapping
      const apiSortField = filters.sortBy || "name";
      const dbSortField = this.mapSortField(apiSortField);
      const sortOrder = filters.sortOrder === "desc" ? false : true;
      query = query.order(dbSortField, { ascending: sortOrder });

      // Pagination
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        brands: (data || []).map((brand) => this.formatBrand(brand)),
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("Error searching brands:", error);
      throw error;
    }
  }

  /**
   * Update brand
   */
  async update(brandId, updateData) {
    try {
      const supabase = getSupabase();

      const updatePayload = {};

      // Map API fields to database columns
      if (updateData.name !== undefined) updatePayload.name = updateData.name;
      if (updateData.slug !== undefined) updatePayload.slug = updateData.slug;
      if (updateData.description !== undefined)
        updatePayload.description = updateData.description;
      if (updateData.country !== undefined)
        updatePayload.country = updateData.country;
      if (updateData.logoUrl !== undefined || updateData.logo_url !== undefined)
        updatePayload.logo_url = updateData.logoUrl || updateData.logo_url;
      if (updateData.metadata !== undefined)
        updatePayload.metadata = updateData.metadata;
      if (updateData.isActive !== undefined)
        updatePayload.is_active = updateData.isActive;

      if (Object.keys(updatePayload).length === 0) {
        return this.findById(brandId);
      }

      const { error } = await supabase
        .from("brands")
        .update(updatePayload)
        .eq("id", brandId);

      if (error) throw error;

      return this.findById(brandId);
    } catch (error) {
      logger.error("Error updating brand:", error);
      throw error;
    }
  }

  /**
   * Delete brand (soft delete)
   */
  async delete(brandId) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("brands")
        .update({ is_active: false })
        .eq("id", brandId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deleting brand:", error);
      throw error;
    }
  }

  /**
   * Format brand object for response
   */
  formatBrand(row) {
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      country: row.country,
      logoUrl: row.logo_url, // Map database field logo_url to API field logoUrl
      metadata: row.metadata || {},
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default new BrandRepository();
