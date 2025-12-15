import { executeSupabaseQuery, getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";
import ProductImageRepository from "./productImageRepository.js";
import BrandRepository from "./brandRepository.js";

/**
 * Product Repository
 * Handles all product-related database operations with Supabase
 */
export class ProductRepository {
  /**
   * Create a new product
   */
  async create(productData) {
    try {
      const supabase = getSupabase();

      // Generate SKU if not provided
      const sku =
        productData.sku ||
        `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      const productPayload = {
        sku,
        title: productData.title,
        short_description: productData.shortDescription,
        description: productData.description,
        product_type: productData.productType || "general",
        base_price: productData.basePrice,
        currency: productData.currency || "INR",
        retailer_id: productData.retailerId,
        metadata: productData.metadata || {},
        is_active: true,
      };

      // Insert product
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert(productPayload)
        .select()
        .single();

      if (productError) throw productError;

      // Add categories if provided
      if (productData.categoryIds && productData.categoryIds.length > 0) {
        const categoryLinks = productData.categoryIds.map((categoryId) => ({
          product_id: product.id,
          category_id: categoryId,
        }));

        const { error: categoryError } = await supabase
          .from("product_categories")
          .insert(categoryLinks);

        if (categoryError) throw categoryError;
      }

      // Add brands if provided
      if (productData.brandIds && productData.brandIds.length > 0) {
        const brandLinks = productData.brandIds.map((brandId) => ({
          product_id: product.id,
          brand_id: brandId,
        }));

        const { error: brandError } = await supabase
          .from("product_brands")
          .insert(brandLinks);

        if (brandError) throw brandError;
      }

      return await this.findById(product.id);
    } catch (error) {
      logger.error("Error creating product:", error);
      throw error;
    }
  }

  /**
   * Find product by ID with complete information
   */
  async findById(productId) {
    try {
      const supabase = getSupabase();

      // basic UUID check
      const isUUID = (s) =>
        typeof s === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          s
        );

      if (!isUUID(productId)) return null;

      // 1) Fetch product with all related data in a single optimized query
      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select(
          `
          *,
          retailers!products_retailer_id_fkey(name, id),
          product_categories(
            categories(id, name, slug, description)
          ),
          product_brands(
            brands(id, name, slug, description, country, logo_url)
          ),
          product_variants(
            id, sku, price, compare_at_price, stock, weight, 
            option_value_1, option_value_2, option_value_3, 
            metadata, created_at, updated_at,
            option_value_1_ref:product_option_values!option_value_1(
              id, value, price_modifier, attribute_id,
              product_option_attributes!inner(id, name, position)
            ),
            option_value_2_ref:product_option_values!option_value_2(
              id, value, price_modifier, attribute_id,
              product_option_attributes!inner(id, name, position)
            ),
            option_value_3_ref:product_option_values!option_value_3(
              id, value, price_modifier, attribute_id,
              product_option_attributes!inner(id, name, position)
            )
          ),
          product_images(
            id, url, alt_text, sort_order, is_primary, variant_id
          )
        `
        )
        .eq("id", productId)
        .eq("is_active", true)
        .limit(1);

      // console.log("Fetched product with optimized query:", products);

      if (prodErr) {
        logger?.error("Supabase: error fetching product", prodErr);
        throw prodErr;
      }

      if (!products || products.length === 0) return null;
      const product = products[0];

      // 2) Process variants with pre-loaded option data
      if (product.product_variants) {
        product.variants = product.product_variants.map((v) => {
          const basePrice = Number(product.base_price ?? 0);
          const variantPrice = v.price != null ? Number(v.price) : null;
          const finalPrice = variantPrice !== null ? variantPrice : basePrice;

          return {
            id: v.id,
            variant_id: v.id,
            sku: v.sku,
            price: finalPrice,
            base_price: basePrice,
            variant_price: variantPrice,
            stock: Number(v.stock ?? 0),
            weight: v.weight,
            metadata: v.metadata,
            created_at: v.created_at,
            updated_at: v.updated_at,
            // Add enhanced option value references with attribute data
            option_value_1_ref: v.option_value_1_ref
              ? {
                  id: v.option_value_1_ref.id,
                  value: v.option_value_1_ref.value,
                  price_modifier: v.option_value_1_ref.price_modifier,
                  attribute_name:
                    v.option_value_1_ref.product_option_attributes?.name,
                  attribute_position:
                    v.option_value_1_ref.product_option_attributes?.position,
                }
              : null,
            option_value_2_ref: v.option_value_2_ref
              ? {
                  id: v.option_value_2_ref.id,
                  value: v.option_value_2_ref.value,
                  price_modifier: v.option_value_2_ref.price_modifier,
                  attribute_name:
                    v.option_value_2_ref.product_option_attributes?.name,
                  attribute_position:
                    v.option_value_2_ref.product_option_attributes?.position,
                }
              : null,
            option_value_3_ref: v.option_value_3_ref
              ? {
                  id: v.option_value_3_ref.id,
                  value: v.option_value_3_ref.value,
                  price_modifier: v.option_value_3_ref.price_modifier,
                  attribute_name:
                    v.option_value_3_ref.product_option_attributes?.name,
                  attribute_position:
                    v.option_value_3_ref.product_option_attributes?.position,
                }
              : null,
          };
        });
        delete product.product_variants; // Clean up
      } else {
        product.variants = [];
      }

      // 3) Process images (already loaded)
      product.images = (product.product_images || [])
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((img) => ({
          id: img.id,
          url: img.url,
          altText: img.alt_text,
          sortOrder: img.sort_order,
          isPrimary: img.is_primary,
          variantId: img.variant_id,
        }));
      delete product.product_images; // Clean up

      // 4) Calculate min price
      product.min_price =
        product.variants.length > 0
          ? Math.min(...product.variants.map((x) => x.price))
          : null;

      // 5) Format categories and brands
      const cats = Array.isArray(product.product_categories)
        ? product.product_categories.map((pc) => pc.categories).filter(Boolean)
        : [];
      product.categories = cats;

      const brs = Array.isArray(product.product_brands)
        ? product.product_brands.map((pb) => pb.brands).filter(Boolean)
        : [];
      product.brands = brs;

      // console.log("Optimized product data:", product);
      return product;
    } catch (error) {
      logger?.error("Error finding product by ID:", error);
      throw error;
    }
  }

  /**
   * Map API field names (camelCase) to database column names (snake_case)
   */
  mapSortField(apiField) {
    const fieldMap = {
      createdAt: "created_at",
      updatedAt: "updated_at",
      basePrice: "base_price",
      productType: "product_type",
      title: "title", // already correct
      rating: "rating", // if you have this field
    };

    return fieldMap[apiField] || apiField;
  }

  /**
   * Search products with enhanced filtering
   */
  async search(filters) {
    try {
      const supabase = getSupabase();

      // Build query
      let query = supabase.from("products").select(
        `
          *,
          retailers!products_retailer_id_fkey(name)
        `,
        { count: "exact" }
      );

      // Apply filters
      query = query.eq("is_active", true);

      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      if (filters.productType) {
        query = query.eq("product_type", filters.productType);
      }

      if (filters.retailerId) {
        query = query.eq("retailer_id", filters.retailerId);
      }

      if (filters.minPrice !== undefined) {
        query = query.gte("base_price", filters.minPrice);
      }

      if (filters.maxPrice !== undefined) {
        query = query.lte("base_price", filters.maxPrice);
      }

      // Apply category filter if provided
      if (filters.categorySlug) {
        // First, get the category ID from the slug
        const { data: categoryData } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", filters.categorySlug)
          .single();

        if (!categoryData) {
          // Category not found
          return {
            products: [],
            pagination: {
              page: filters.page || 1,
              limit: filters.limit || 20,
              total: 0,
              totalPages: 0,
            },
          };
        }

        // Now get products for this category
        const { data: productIds } = await supabase
          .from("product_categories")
          .select("product_id")
          .eq("category_id", categoryData.id);

        if (productIds && productIds.length > 0) {
          const ids = productIds.map((p) => p.product_id);
          query = query.in("id", ids);
        } else {
          // No products found for this category
          return {
            products: [],
            pagination: {
              page: filters.page || 1,
              limit: filters.limit || 20,
              total: 0,
              totalPages: 0,
            },
          };
        }
      }

      // Apply brand filter if provided
      if (filters.brand) {
        const { data: productIds } = await supabase
          .from("product_brands")
          .select("product_id")
          .eq("brand_id", filters.brand);

        if (productIds && productIds.length > 0) {
          const ids = productIds.map((p) => p.product_id);
          query = query.in("id", ids);
        } else {
          return {
            products: [],
            pagination: {
              page: filters.page || 1,
              limit: filters.limit || 20,
              total: 0,
              totalPages: 0,
            },
          };
        }
      }

      // Sorting with field mapping
      const apiSortField = filters.sortBy || "createdAt";
      const dbSortField = this.mapSortField(apiSortField);
      const sortOrder = filters.sortOrder === "asc";
      query = query.order(dbSortField, { ascending: sortOrder });

      // Pagination
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data: products, error, count } = await query;

      if (error) throw error;

      return {
        products: (products || []).map((product) =>
          this.formatProduct(product)
        ),
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error("Error searching products:", error);
      throw error;
    }
  }

  /**
   * Update product
   */
  async update(productId, updateData) {
    try {
      const supabase = getSupabase();

      const updatePayload = {};

      // Map fields to database columns
      if (updateData.title !== undefined)
        updatePayload.title = updateData.title;
      if (updateData.shortDescription !== undefined)
        updatePayload.short_description = updateData.shortDescription;
      if (updateData.description !== undefined)
        updatePayload.description = updateData.description;
      if (updateData.productType !== undefined)
        updatePayload.product_type = updateData.productType;
      if (updateData.basePrice !== undefined)
        updatePayload.base_price = updateData.basePrice;
      if (updateData.currency !== undefined)
        updatePayload.currency = updateData.currency;
      if (updateData.retailerId !== undefined)
        updatePayload.retailer_id = updateData.retailerId;
      if (updateData.isActive !== undefined)
        updatePayload.is_active = updateData.isActive;
      if (updateData.metadata !== undefined)
        updatePayload.metadata = updateData.metadata;

      if (Object.keys(updatePayload).length === 0) {
        return this.findById(productId);
      }

      const { error } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", productId);

      if (error) throw error;

      return this.findById(productId);
    } catch (error) {
      logger.error("Error updating product:", error);
      throw error;
    }
  }

  /**
   * Get products for a specific school
   */
  async getBySchool(schoolId, filters = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase
        .from("product_schools")
        .select(
          `
          grade,
          mandatory,
          products!inner(
            *,
            retailers!products_retailer_id_fkey(name)
          )
        `
        )
        .eq("school_id", schoolId)
        .eq("products.is_active", true);

      if (filters.grade) {
        query = query.eq("grade", filters.grade);
      }

      if (filters.productType) {
        query = query.eq("products.product_type", filters.productType);
      }

      query = query
        .order("mandatory", { ascending: false })
        .order("products.title", { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((item) => ({
        ...this.formatProduct(item.products),
        schoolInfo: {
          grade: item.grade,
          mandatory: item.mandatory,
        },
      }));
    } catch (error) {
      logger.error("Error getting products by school:", error);
      throw error;
    }
  }

  /**
   * Get product categories
   */
  async getProductCategories(productId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_categories")
        .select(
          `
          categories!inner(
            id, name, slug, description, parent_id
          )
        `
        )
        .eq("product_id", productId)
        .eq("categories.is_active", true);

      if (error) throw error;

      return (data || []).map((item) => item.categories);
    } catch (error) {
      logger.error("Error getting product categories:", error);
      throw error;
    }
  }

  /**
   * Get product brands
   */
  async getProductBrands(productId) {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("product_brands")
        .select(
          `
          brands!inner(
            id, name, slug, description, country, logo_url
          )
        `
        )
        .eq("product_id", productId)
        .eq("brands.is_active", true);

      if (error) throw error;

      return (data || []).map((item) => item.brands);
    } catch (error) {
      logger.error("Error getting product brands:", error);
      throw error;
    }
  }

  /**
   * Delete product (soft delete)
   */
  async delete(productId) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", productId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deleting product:", error);
      throw error;
    }
  }

  /**
   * Count products with filters
   */
  async count(filters = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      if (filters.productType) {
        query = query.eq("product_type", filters.productType);
      }

      if (filters.retailerId) {
        query = query.eq("retailer_id", filters.retailerId);
      }

      const { count, error } = await query;

      if (error) throw error;

      return count || 0;
    } catch (error) {
      logger.error("Error counting products:", error);
      throw error;
    }
  }

  /**
   * Format product object for response
   */
  formatProduct(row) {
    if (!row) return null;

    return {
      id: row.id,
      sku: row.sku,
      title: row.title,
      shortDescription: row.short_description,
      description: row.description,
      productType: row.product_type,
      basePrice: parseFloat(row.base_price),
      currency: row.currency,
      retailerId: row.retailer_id,
      retailerName: row.retailers?.name,
      isActive: Boolean(row.is_active),
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Include additional data if present
      categories: row.product_categories?.map((pc) => pc.categories) || [],
      brands: row.product_brands?.map((pb) => pb.brands) || [],
    };
  }

  /**
   * Add product image (supports both file upload and URL)
   */
  async addProductImage(productId, imageData) {
    try {
      const supabase = getSupabase();

      // Validate product exists
      const product = await this.findById(productId);
      if (!product) {
        throw new Error("Product not found");
      }

      // Validate variant if provided
      if (imageData.variantId) {
        const { data: variant, error: variantError } = await supabase
          .from("product_variants")
          .select("id")
          .eq("id", imageData.variantId)
          .eq("product_id", productId)
          .single();

        if (variantError || !variant) {
          throw new Error(
            "Product variant not found or doesn't belong to this product"
          );
        }
      }

      // Handle image upload or URL
      let imageUrl = imageData.url;

      if (imageData.file && !imageUrl) {
        // If file is provided, upload to Supabase storage
        const fileName = `products/${productId}/${
          imageData.variantId || "main"
        }/${Date.now()}-${imageData.file.name}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(fileName, imageData.file);

        if (uploadError) throw uploadError;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("product-images").getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      if (!imageUrl) {
        throw new Error("Either file or URL must be provided");
      }

      // Create image record
      const imagePayload = {
        product_id: productId,
        variant_id: imageData.variantId || null,
        url: imageUrl,
        alt_text: imageData.altText || imageData.alt_text || null,
        sort_order: imageData.sortOrder || imageData.sort_order || 0,
        is_primary: imageData.isPrimary || imageData.is_primary || false,
        // image_type: imageData.imageType || "product", // 'product', 'variant', 'thumbnail', 'gallery'
        // metadata: {
        //   source: imageData.file ? "upload" : "url",
        //   original_name: imageData.file?.name || null,
        //   size: imageData.file?.size || null,
        //   mime_type: imageData.file?.type || null,
        //   ...imageData.metadata,
        // },
      };

      const { data: image, error: imageError } = await supabase
        .from("product_images")
        .insert(imagePayload)
        .select()
        .single();

      if (imageError) throw imageError;

      // If this is set as primary, unset other primary images
      if (imagePayload.is_primary) {
        await this.setPrimaryImage(image.id, productId, imageData.variantId);
      }

      return ProductImageRepository.formatImage(image);
    } catch (error) {
      logger.error("Error adding product image:", error);
      throw error;
    }
  }

  /**
   * Add multiple images for a product/variant
   */
  async addProductImages(productId, imagesData) {
    try {
      const results = [];

      for (const imageData of imagesData) {
        const result = await this.addProductImage(productId, imageData);
        results.push(result);
      }

      return results;
    } catch (error) {
      logger.error("Error adding multiple product images:", error);
      throw error;
    }
  }

  /**
   * Update product image
   */
  async updateProductImage(imageId, updateData) {
    try {
      const supabase = getSupabase();

      // Get existing image
      const { data: existingImage, error: fetchError } = await supabase
        .from("product_images")
        .select("*")
        .eq("id", imageId)
        .single();

      if (fetchError || !existingImage) {
        throw new Error("Image not found");
      }

      // Handle new file upload if provided
      let imageUrl = updateData.url || existingImage.url;

      if (updateData.file) {
        const fileName = `products/${existingImage.product_id}/${
          existingImage.variant_id || "main"
        }/${Date.now()}-${updateData.file.name}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(fileName, updateData.file);

        if (uploadError) throw uploadError;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("product-images").getPublicUrl(fileName);

        imageUrl = publicUrl;

        // Delete old file if it was uploaded (not external URL)
        if (existingImage.metadata?.source === "upload") {
          // Extract file path from URL and delete
          const oldPath = existingImage.url.split("/").slice(-4).join("/");
          await supabase.storage.from("product-images").remove([oldPath]);
        }
      }

      const updatePayload = {
        url: imageUrl,
        alt_text:
          updateData.altText || updateData.alt_text || existingImage.alt_text,
        sort_order:
          updateData.sortOrder ||
          updateData.sort_order ||
          existingImage.sort_order,
        is_primary:
          updateData.isPrimary !== undefined
            ? updateData.isPrimary
            : existingImage.is_primary,
        image_type: updateData.imageType || existingImage.image_type,
        metadata: {
          ...existingImage.metadata,
          source: updateData.file
            ? "upload"
            : updateData.url
            ? "url"
            : existingImage.metadata?.source,
          original_name:
            updateData.file?.name || existingImage.metadata?.original_name,
          size: updateData.file?.size || existingImage.metadata?.size,
          mime_type: updateData.file?.type || existingImage.metadata?.mime_type,
          ...updateData.metadata,
        },
      };

      const { data: updatedImage, error: updateError } = await supabase
        .from("product_images")
        .update(updatePayload)
        .eq("id", imageId)
        .select()
        .single();

      if (updateError) throw updateError;

      // If this is set as primary, unset other primary images
      if (updatePayload.is_primary && !existingImage.is_primary) {
        await this.setPrimaryImage(
          imageId,
          existingImage.product_id,
          existingImage.variant_id
        );
      }

      return ProductImageRepository.formatImage(updatedImage);
    } catch (error) {
      logger.error("Error updating product image:", error);
      throw error;
    }
  }

  /**
   * Delete product image
   */
  async deleteProductImage(imageId) {
    try {
      const supabase = getSupabase();

      // Get existing image
      const { data: existingImage, error: fetchError } = await supabase
        .from("product_images")
        .select("*")
        .eq("id", imageId)
        .single();

      if (fetchError || !existingImage) {
        throw new Error("Image not found");
      }

      // Delete file from storage if it was uploaded
      if (existingImage.metadata?.source === "upload") {
        const filePath = existingImage.url.split("/").slice(-4).join("/");
        await supabase.storage.from("product-images").remove([filePath]);
      }

      // Delete image record
      const { error: deleteError } = await supabase
        .from("product_images")
        .delete()
        .eq("id", imageId);

      if (deleteError) throw deleteError;

      return true;
    } catch (error) {
      logger.error("Error deleting product image:", error);
      throw error;
    }
  }

  /**
   * Set primary image for product/variant
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
      } else {
        resetQuery = resetQuery.is("variant_id", null);
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
   * Get images for product/variant with enhanced filtering
   */
  async getProductImages(productId, options = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId);

      // Filter by variant
      if (options.variantId) {
        query = query.eq("variant_id", options.variantId);
      } else if (options.includeVariantImages === false) {
        query = query.is("variant_id", null);
      }

      // Filter by image type
      if (options.imageType) {
        query = query.eq("image_type", options.imageType);
      }

      // Filter by primary status
      if (options.primaryOnly) {
        query = query.eq("is_primary", true);
      }

      // Order by sort_order and created_at
      query = query.order("sort_order").order("created_at");

      // Limit results if specified
      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((image) =>
        ProductImageRepository.formatImage(image)
      );
    } catch (error) {
      logger.error("Error getting product images:", error);
      throw error;
    }
  }

  /**
   * Add or update brand details for product
   */
  async addProductBrand(productId, brandData) {
    try {
      const supabase = getSupabase();

      // Validate product exists
      const product = await this.findById(productId);
      if (!product) {
        throw new Error("Product not found");
      }

      let brandId = brandData.brandId;

      // If no brandId provided, create new brand
      if (!brandId) {
        const newBrand = await BrandRepository.create({
          name: brandData.name,
          slug:
            brandData.slug || brandData.name.toLowerCase().replace(/\s+/g, "-"),
          description: brandData.description,
          country: brandData.country,
          logoUrl: brandData.logoUrl,
          metadata: brandData.metadata || {},
        });
        brandId = newBrand.id;
      } else {
        // Validate brand exists
        const existingBrand = await BrandRepository.findById(brandId);
        if (!existingBrand) {
          throw new Error("Brand not found");
        }
      }

      // Check if association already exists
      const { data: existingAssociation } = await supabase
        .from("product_brands")
        .select("id")
        .eq("product_id", productId)
        .eq("brand_id", brandId)
        .single();

      if (existingAssociation) {
        return { message: "Brand already associated with product", brandId };
      }

      // Create brand-product association
      const { data: association, error: associationError } = await supabase
        .from("product_brands")
        .insert({
          product_id: productId,
          brand_id: brandId,
        })
        .select()
        .single();

      if (associationError) throw associationError;

      // If this is set as primary, unset other primary brands
      if (brandData.isPrimary) {
        await supabase
          .from("product_brands")
          .update({ is_primary: false })
          .eq("product_id", productId)
          .neq("id", association.id);
      }

      return {
        brandId,
        associationId: association.id,
        message: "Brand successfully associated with product",
      };
    } catch (error) {
      logger.error("Error adding product brand:", error);
      throw error;
    }
  }

  /**
   * Remove brand from product
   */
  async removeProductBrand(productId, brandId) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("product_brands")
        .delete()
        .eq("product_id", productId)
        .eq("brand_id", brandId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error removing product brand:", error);
      throw error;
    }
  }

  /**
   * Remove all brands from product
   */
  async removeAllProductBrands(productId) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("product_brands")
        .delete()
        .eq("product_id", productId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error removing all product brands:", error);
      throw error;
    }
  }

  /**
   * Add retailer details to product
   */
  async addRetailerDetails(productId, retailerData) {
    try {
      const supabase = getSupabase();

      // Validate product exists
      const product = await this.findById(productId);
      if (!product) {
        throw new Error("Product not found");
      }

      let retailerId = retailerData.retailerId;

      // If no retailerId provided, create new retailer
      if (!retailerId) {
        const retailerPayload = {
          name: retailerData.name,
          contact_email: retailerData.contact_email,
          contact_phone: retailerData.contact_phone,
          address: retailerData.address,
          website: retailerData.website,
          is_verified: false, // Default to false for new retailers
          metadata: retailerData.metadata || {},
        };

        const { data: newRetailer, error: retailerError } = await supabase
          .from("retailers")
          .insert(retailerPayload)
          .select()
          .single();

        if (retailerError) throw retailerError;
        retailerId = newRetailer.id;
      } else {
        // Validate retailer exists
        const { data: existingRetailer, error: fetchError } = await supabase
          .from("retailers")
          .select("id")
          .eq("id", retailerId)
          .single();

        if (fetchError || !existingRetailer) {
          throw new Error("Retailer not found");
        }
      }

      // Update product with retailer
      const { error: updateError } = await supabase
        .from("products")
        .update({
          retailer_id: retailerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);

      if (updateError) throw updateError;

      return {
        retailerId,
        message: "Retailer successfully associated with product",
      };
    } catch (error) {
      logger.error("Error adding retailer details:", error);
      throw error;
    }
  }

  /**
   * Remove retailer from product
   */
  async removeRetailerDetails(productId) {
    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("products")
        .update({
          retailer_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);

      if (error) throw error;

      return {
        message: "Retailer successfully removed from product",
      };
    } catch (error) {
      logger.error("Error removing retailer details:", error);
      throw error;
    }
  }

  /**
   * Get variant images with enhanced metadata
   */
  async getVariantImages(variantId) {
    try {
      const supabase = getSupabase();

      // Get variant details first
      const { data: variant, error: variantError } = await supabase
        .from("product_variants")
        .select("product_id")
        .eq("id", variantId)
        .single();

      if (variantError || !variant) {
        throw new Error("Variant not found");
      }

      // Get images for this variant
      const images = await this.getProductImages(variant.product_id, {
        variantId: variantId,
        includeVariantImages: true,
      });

      return images;
    } catch (error) {
      logger.error("Error getting variant images:", error);
      throw error;
    }
  }

  /**
   * Bulk upload images for variants
   */
  async bulkUploadVariantImages(productId, variantImagesData) {
    try {
      const results = {};

      for (const [variantId, imagesData] of Object.entries(variantImagesData)) {
        try {
          const variantImages = [];

          for (const imageData of imagesData) {
            const image = await this.addProductImage(productId, {
              ...imageData,
              variantId: variantId,
            });
            variantImages.push(image);
          }

          results[variantId] = {
            success: true,
            images: variantImages,
            count: variantImages.length,
          };
        } catch (error) {
          results[variantId] = {
            success: false,
            error: error.message,
            count: 0,
          };
        }
      }

      return results;
    } catch (error) {
      logger.error("Error bulk uploading variant images:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive product data with images, brands, and retailer
   */
  async getProductWithDetails(productId, options = {}) {
    try {
      const product = await this.findById(productId);
      if (!product) {
        throw new Error("Product not found");
      }

      // Get images if requested
      if (options.includeImages !== false) {
        product.images = await this.getProductImages(productId, {
          includeVariantImages: options.includeVariantImages !== false,
        });

        // Group images by variant
        product.imagesByVariant = {};
        product.mainImages = [];

        for (const image of product.images) {
          if (image.variantId) {
            if (!product.imagesByVariant[image.variantId]) {
              product.imagesByVariant[image.variantId] = [];
            }
            product.imagesByVariant[image.variantId].push(image);
          } else {
            product.mainImages.push(image);
          }
        }
      }

      // Get enhanced brand details if requested
      if (options.includeBrandDetails) {
        const brands = await this.getProductBrands(productId);
        product.brandDetails = brands;
      }

      // Get retailer details if requested
      if (options.includeRetailerDetails && product.retailerId) {
        const supabase = getSupabase();
        const { data: retailer, error: retailerError } = await supabase
          .from("retailers")
          .select("*")
          .eq("id", product.retailerId)
          .eq("is_active", true)
          .single();

        if (!retailerError && retailer) {
          product.retailerDetails = {
            id: retailer.id,
            name: retailer.name,
            email: retailer.contact_email,
            phone: retailer.contact_phone,
            address: retailer.address,
            metadata: retailer.metadata,
          };
        }
      }

      return product;
    } catch (error) {
      logger.error("Error getting product with details:", error);
      throw error;
    }
  }
}

export default new ProductRepository();
