import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Product Variant Repository
 * Handles all product variant database operations with Supabase
 */
export class ProductVariantRepository {
  /**
   * Create a new product variant
   */
  async create(variantData) {
    try {
      const supabase = getSupabase();

      const payload = {
        product_id: variantData.productId,
        sku: variantData.sku,
        price: variantData.price,
        compare_at_price: variantData.compareAtPrice,
        stock: variantData.stock || 0,
        weight: variantData.weight,
        option_value_1: variantData.optionValue1,
        option_value_2: variantData.optionValue2,
        option_value_3: variantData.optionValue3,
        metadata: variantData.metadata || {},
      };

      const { data, error } = await supabase
        .from("product_variants")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      return this.formatVariant(data);
    } catch (error) {
      logger.error("Error creating product variant:", error);
      throw error;
    }
  }

  /**
   * Find variant by ID
   */
  async findById(variantId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_variants")
        .select(
          `
          *,
          products!inner(title, sku, base_price),
          option_value_1_ref:product_option_values!option_value_1(id, value),
          option_value_2_ref:product_option_values!option_value_2(id, value),
          option_value_3_ref:product_option_values!option_value_3(id, value)
        `
        )
        .eq("id", variantId)
        .single();

      if (error && error.code === "PGRST116") return null;
      if (error) throw error;

      return data ? this.formatVariant(data) : null;
    } catch (error) {
      logger.error("Error finding variant by ID:", error);
      throw error;
    }
  }

  /**
   * Find all variants for a product
   */
  async findByProductId(productId) {
    try {
      const supabase = getSupabase();

      console.log("Fetching variants for product ID:", productId);

      const { data, error } = await supabase
        .from("product_variants")
        .select(
          `
          *,
          option_value_1_ref:product_option_values!option_value_1(id, value),
          option_value_2_ref:product_option_values!option_value_2(id, value),
          option_value_3_ref:product_option_values!option_value_3(id, value)
        `
        )
        .eq("product_id", productId)
        .order("created_at");

      if (error) throw error;

      return (data || []).map((variant) => this.formatVariant(variant));
    } catch (error) {
      logger.error("Error finding variants by product ID:", error);
      throw error;
    }
  }

  /**
   * Update variant
   */
  async update(variantId, updateData) {
    try {
      const supabase = getSupabase();

      const updatePayload = {};

      if (updateData.sku !== undefined) updatePayload.sku = updateData.sku;
      if (updateData.price !== undefined)
        updatePayload.price = updateData.price;
      if (updateData.compareAtPrice !== undefined)
        updatePayload.compare_at_price = updateData.compareAtPrice;
      if (updateData.stock !== undefined)
        updatePayload.stock = updateData.stock;
      if (updateData.weight !== undefined)
        updatePayload.weight = updateData.weight;
      if (updateData.optionValue1 !== undefined)
        updatePayload.option_value_1 = updateData.optionValue1;
      if (updateData.optionValue2 !== undefined)
        updatePayload.option_value_2 = updateData.optionValue2;
      if (updateData.optionValue3 !== undefined)
        updatePayload.option_value_3 = updateData.optionValue3;
      if (updateData.metadata !== undefined)
        updatePayload.metadata = updateData.metadata;

      if (Object.keys(updatePayload).length === 0) {
        return this.findById(variantId);
      }

      const { error } = await supabase
        .from("product_variants")
        .update(updatePayload)
        .eq("id", variantId);

      if (error) throw error;

      return this.findById(variantId);
    } catch (error) {
      logger.error("Error updating variant:", error);
      throw error;
    }
  }

  /**
   * Delete variant
   */
  async delete(variantId) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("product_variants")
        .delete()
        .eq("id", variantId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deleting variant:", error);
      throw error;
    }
  }

  /**
   * Update stock for a variant
   */
  async updateStock(variantId, quantity, operation = "set") {
    try {
      const supabase = getSupabase();

      if (operation === "set") {
        const { error } = await supabase
          .from("product_variants")
          .update({ stock: quantity })
          .eq("id", variantId);

        if (error) throw error;
      } else if (operation === "increment") {
        const { error } = await supabase.rpc("increment_variant_stock", {
          variant_id: variantId,
          quantity: quantity,
        });

        if (error) throw error;
      } else if (operation === "decrement") {
        const { error } = await supabase.rpc("decrement_variant_stock", {
          variant_id: variantId,
          quantity: quantity,
        });

        if (error) throw error;
      }

      return this.findById(variantId);
    } catch (error) {
      logger.error("Error updating variant stock:", error);
      throw error;
    }
  }

  /**
   * Search variants with filters
   */
  async search(filters = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase.from("product_variants").select(
        `
          *,
          products!inner(title, sku, base_price, product_type)
        `,
        { count: "exact" }
      );

      if (filters.productId) {
        query = query.eq("product_id", filters.productId);
      }

      if (filters.minPrice !== undefined) {
        query = query.gte("price", filters.minPrice);
      }

      if (filters.maxPrice !== undefined) {
        query = query.lte("price", filters.maxPrice);
      }

      if (filters.inStock === true) {
        query = query.gt("stock", 0);
      } else if (filters.inStock === false) {
        query = query.eq("stock", 0);
      }

      // Pagination
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
      const offset = (page - 1) * limit;

      // Sorting
      const sortBy = filters.sortBy || "created_at";
      const sortOrder = filters.sortOrder === "asc";
      query = query.order(sortBy, { ascending: sortOrder });

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        variants: (data || []).map((variant) => this.formatVariant(variant)),
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("Error searching variants:", error);
      throw error;
    }
  }

  /**
   * Format variant object for response
   */
  formatVariant(row) {
    if (!row) return null;

    return {
      id: row.id,
      productId: row.product_id,
      sku: row.sku,
      price: parseFloat(row.price || 0),
      compareAtPrice: row.compare_at_price
        ? parseFloat(row.compare_at_price)
        : null,
      stock: parseInt(row.stock || 0),
      weight: row.weight ? parseFloat(row.weight) : null,
      optionValues: {
        value1: row.option_value_1_ref || null,
        value2: row.option_value_2_ref || null,
        value3: row.option_value_3_ref || null,
      },
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Include product info if available
      product: row.products
        ? {
            title: row.products.title,
            sku: row.products.sku,
            basePrice: parseFloat(row.products.base_price),
            productType: row.products.product_type,
          }
        : null,
    };
  }
}

export default new ProductVariantRepository();
