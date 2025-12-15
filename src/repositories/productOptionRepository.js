import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Product Option Repository
 * Handles all database operations for product options, attributes, and values with Supabase
 */
export class ProductOptionRepository {
  /**
   * Create a product option attribute
   */
  async createAttribute(attributeData) {
    try {
      const supabase = getSupabase();

      const payload = {
        product_id: attributeData.productId,
        name: attributeData.name,
        position: attributeData.position,
        is_required: attributeData.isRequired || true,
      };

      const { data, error } = await supabase
        .from("product_option_attributes")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      return this.formatAttribute(data);
    } catch (error) {
      logger.error("Error creating product option attribute:", error);
      throw error;
    }
  }

  /**
   * Create a product option value
   */
  async createValue(valueData) {
    try {
      const supabase = getSupabase();

      const payload = {
        attribute_id: valueData.attributeId,
        value: valueData.value,
        price_modifier: valueData.priceModifier || 0,
        sort_order: valueData.sortOrder || 0,
      };

      const { data, error } = await supabase
        .from("product_option_values")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      return this.formatValue(data);
    } catch (error) {
      logger.error("Error creating product option value:", error);
      throw error;
    }
  }

  /**
   * Find attribute by ID
   */
  async findAttributeById(id) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_option_attributes")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code === "PGRST116") return null;
      if (error) throw error;

      return data ? this.formatAttribute(data) : null;
    } catch (error) {
      logger.error("Error finding attribute by ID:", error);
      throw error;
    }
  }

  /**
   * Find value by ID
   */
  async findValueById(id) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_option_values")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code === "PGRST116") return null;
      if (error) throw error;

      return data ? this.formatValue(data) : null;
    } catch (error) {
      logger.error("Error finding value by ID:", error);
      throw error;
    }
  }

  /**
   * Get all attributes for a product
   */
  async findAttributesByProductId(productId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_option_attributes")
        .select("*")
        .eq("product_id", productId)
        .order("position");

      if (error) throw error;

      return (data || []).map((attr) => this.formatAttribute(attr));
    } catch (error) {
      logger.error("Error finding attributes by product ID:", error);
      throw error;
    }
  }

  /**
   * Get all values for an attribute
   */
  async findValuesByAttributeId(attributeId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_option_values")
        .select("*")
        .eq("attribute_id", attributeId)
        .order("sort_order")
        .order("value");

      if (error) throw error;

      return (data || []).map((value) => this.formatValue(value));
    } catch (error) {
      logger.error("Error finding values by attribute ID:", error);
      throw error;
    }
  }

  /**
   * Get complete product options structure
   */
  async findProductOptionsStructure(productId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_option_attributes")
        .select(
          `
          id,
          name,
          position,
          is_required,
          product_option_values (
            id,
            value,
            price_modifier,
            sort_order
          )
        `
        )
        .eq("product_id", productId)
        .order("position");

      if (error) throw error;

      return (data || []).map((attr) => ({
        id: attr.id,
        name: attr.name,
        position: attr.position,
        isRequired: Boolean(attr.is_required),
        values: (attr.product_option_values || [])
          .sort((a, b) => {
            // First sort by sort_order, then by value
            if (a.sort_order !== b.sort_order) {
              return a.sort_order - b.sort_order;
            }
            return a.value.localeCompare(b.value);
          })
          .map((value) => ({
            id: value.id,
            value: value.value,
            priceModifier: parseFloat(value.price_modifier || 0),
            sortOrder: value.sort_order,
          })),
      }));
    } catch (error) {
      logger.error("Error finding product options structure:", error);
      throw error;
    }
  }

  /**
   * Update attribute
   */
  async updateAttribute(id, updateData) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_option_attributes")
        .update({
          name: updateData.name,
          position: updateData.position,
          is_required: updateData.isRequired,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return this.formatAttribute(data);
    } catch (error) {
      logger.error("Error updating attribute:", error);
      throw error;
    }
  }

  /**
   * Update value
   */
  async updateValue(id, updateData) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_option_values")
        .update({
          value: updateData.value,
          price_modifier: updateData.priceModifier || 0,
          sort_order: updateData.sortOrder || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return this.formatValue(data);
    } catch (error) {
      logger.error("Error updating value:", error);
      throw error;
    }
  }

  /**
   * Delete attribute (and all its values due to cascade)
   */
  async deleteAttribute(id) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("product_option_attributes")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deleting attribute:", error);
      throw error;
    }
  }

  /**
   * Delete value
   */
  async deleteValue(id) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("product_option_values")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deleting value:", error);
      throw error;
    }
  }

  /**
   * Format attribute data
   */
  formatAttribute(attr) {
    return {
      id: attr.id,
      productId: attr.product_id,
      name: attr.name,
      position: attr.position,
      isRequired: Boolean(attr.is_required),
      createdAt: attr.created_at,
    };
  }

  /**
   * Format value data
   */
  formatValue(value) {
    return {
      id: value.id,
      attributeId: value.attribute_id,
      value: value.value,
      priceModifier: parseFloat(value.price_modifier || 0),
      sortOrder: value.sort_order,
      createdAt: value.created_at,
    };
  }
}

export default new ProductOptionRepository();
