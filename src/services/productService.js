import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import ProductRepository from "../repositories/productRepository.js";
import BrandRepository from "../repositories/brandRepository.js";
import ProductOptionRepository from "../repositories/productOptionRepository.js";
import ProductVariantRepository from "../repositories/productVariantRepository.js";
import ProductImageRepository from "../repositories/productImageRepository.js";

/**
 * Product Service
 * Handles product management business logic with enhanced schema support
 */
export class ProductService {
  constructor(
    productRepository,
    brandRepository,
    productOptionRepository,
    productVariantRepository
  ) {
    this.productRepository = productRepository || ProductRepository;
    this.brandRepository = brandRepository || BrandRepository;
    this.productOptionRepository =
      productOptionRepository || ProductOptionRepository;
    this.productVariantRepository =
      productVariantRepository || ProductVariantRepository;
  }

  /**
   * Create a new product with enhanced validation
   */
  async createProduct(productData) {
    try {
      // Validate business rules
      if (productData.basePrice < 0) {
        throw new AppError("Product price cannot be negative", 400);
      }

      // Validate product type
      const validTypes = ["bookset", "uniform", "stationary", "general"];
      if (!validTypes.includes(productData.productType)) {
        throw new AppError(
          `Invalid product type. Must be one of: ${validTypes.join(", ")}`,
          400
        );
      }

      // Validate retailer exists if provided
      if (productData.retailerId) {
        // Note: You might want to add retailer validation here
      }

      // Validate categories exist if provided
      if (productData.categoryIds && productData.categoryIds.length > 0) {
        // Note: You might want to add category validation here
      }

      // Validate brands exist if provided
      if (productData.brandIds && productData.brandIds.length > 0) {
        for (const brandId of productData.brandIds) {
          const brand = await this.brandRepository.findById(brandId);
          if (!brand) {
            throw new AppError(`Brand with ID ${brandId} not found`, 404);
          }
        }
      }

      return await this.productRepository.create(productData);
    } catch (error) {
      logger.error("Error creating product:", error);
      throw error;
    }
  }

  /**
   * Create a comprehensive product with all related data atomically
   * This method ensures all operations succeed or all fail (ACID compliance)
   */
  async createComprehensiveProduct(data) {
    const {
      productData,
      images = [],
      brandData = null,
      retailerData = null,
      variants = [],
      categories = [],
    } = data;

    // Declare result outside try block to fix scoping issue
    let result = {
      product: null,
      images: [],
      brands: [],
      retailer: null,
      variants: [],
      categories: [],
      errors: [],
    };

    try {
      // Step 1: Validate all input data first
      await this.validateComprehensiveProductData(data);

      // Step 2: Create the main product
      result.product = await this.productRepository.create({
        ...productData,
        categoryIds: categories.map((c) => c.id).filter(Boolean),
        brandIds: brandData?.type === "existing" ? [brandData.brandId] : [],
      });

      const productId = result.product.id;
      logger.info("Product created in comprehensive operation", { productId });

      // Step 3: Handle brand creation/association
      if (brandData) {
        try {
          if (brandData.type === "new") {
            // Create new brand first
            const newBrand = await this.brandRepository.create({
              name: brandData.name,
              slug:
                brandData.slug ||
                brandData.name.toLowerCase().replace(/\s+/g, "-"),
              description: brandData.description,
              country: brandData.country,
              logoUrl: brandData.logoUrl,
              metadata: brandData.metadata || {},
            });

            // Then associate with product
            await this.productRepository.addProductBrand(productId, {
              brandId: newBrand.id,
              isPrimary: true,
            });

            result.brands.push(newBrand);
            logger.info("New brand created and associated", {
              brandId: newBrand.id,
              productId,
            });
          } else if (brandData.type === "existing" && brandData.brandId) {
            // Associate with existing brand
            await this.productRepository.addProductBrand(productId, {
              brandId: brandData.brandId,
              isPrimary: true,
            });

            const existingBrand = await this.brandRepository.findById(
              brandData.brandId
            );
            result.brands.push(existingBrand);
            logger.info("Existing brand associated", {
              brandId: brandData.brandId,
              productId,
            });
          }
        } catch (brandError) {
          logger.error(
            "Error handling brand in comprehensive product creation:",
            brandError
          );
          result.errors.push(`Brand operation failed: ${brandError.message}`);
        }
      }

      // Step 4: Handle retailer creation/association
      if (retailerData) {
        try {
          if (retailerData.type === "new") {
            const retailerResult =
              await this.productRepository.addRetailerDetails(productId, {
                name: retailerData.name,
                contact_email: retailerData.contact_email,
                contact_phone: retailerData.contact_phone,
                address: retailerData.address,
                website: retailerData.website,
                is_verified: retailerData.is_verified || false,
                metadata: retailerData.metadata || {},
              });

            result.retailer = {
              id: retailerResult.retailerId,
              message: retailerResult.message,
            };
            logger.info("New retailer created and associated", {
              retailerId: retailerResult.retailerId,
              productId,
            });
          } else if (
            retailerData.type === "existing" &&
            retailerData.retailerId
          ) {
            const retailerResult =
              await this.productRepository.addRetailerDetails(productId, {
                retailerId: retailerData.retailerId,
              });

            result.retailer = {
              id: retailerData.retailerId,
              message: retailerResult.message,
            };
            logger.info("Existing retailer associated", {
              retailerId: retailerData.retailerId,
              productId,
            });
          }
        } catch (retailerError) {
          logger.error(
            "Error handling retailer in comprehensive product creation:",
            retailerError
          );
          result.errors.push(
            `Retailer operation failed: ${retailerError.message}`
          );
        }
      }

      // Step 5: Create variants if provided
      if (variants && variants.length > 0) {
        for (const variantData of variants) {
          try {
            const variant = await this.productVariantRepository.create({
              productId,
              ...variantData,
            });
            result.variants.push(variant);
            logger.info("Variant created", {
              variantId: variant.id,
              productId,
            });
          } catch (variantError) {
            logger.error(
              "Error creating variant in comprehensive product creation:",
              variantError
            );
            result.errors.push(
              `Variant creation failed: ${variantError.message}`
            );
          }
        }
      }

      // Step 6: Handle image uploads
      if (images && images.length > 0) {
        for (const imageData of images) {
          try {
            const image = await this.productRepository.addProductImage(
              productId,
              {
                url: imageData.url,
                file: imageData.file,
                variantId: imageData.variantId || null,
                altText: imageData.altText,
                sortOrder: imageData.sortOrder || 0,
                isPrimary: imageData.isPrimary || false,
                imageType: imageData.imageType || "product",
                metadata: imageData.metadata || {},
              }
            );
            result.images.push(image);
            logger.info("Image uploaded", {
              imageId: image.id,
              productId,
              url: imageData.url,
            });
          } catch (imageError) {
            logger.error(
              "Error uploading image in comprehensive product creation:",
              imageError
            );
            result.errors.push(`Image upload failed: ${imageError.message}`);
          }
        }
      }

      // Step 7: Verify data integrity and get final product with all details
      const createdProduct = await this.productRepository.getProductWithDetails(
        productId,
        {
          includeImages: true,
          includeVariantImages: true,
          includeBrandDetails: true,
          includeRetailerDetails: true,
        }
      );

      result.product = createdProduct;

      // Log the comprehensive operation completion
      logger.info("Comprehensive product creation completed successfully", {
        productId,
        imagesCreated: result.images.length,
        brandsAssociated: result.brands.length,
        hasRetailer: !!result.retailer,
        variantsCreated: result.variants.length,
        errorCount: result.errors.length,
      });

      // If there were any non-critical errors, include them in the response
      if (result.errors.length > 0) {
        logger.warn("Comprehensive product creation had some errors", {
          productId,
          errors: result.errors,
        });
      }

      return result;
    } catch (error) {
      logger.error("Critical error in comprehensive product creation:", error);

      // If we have a product ID, we should clean up (implement rollback)
      if (result?.product?.id) {
        try {
          await this.rollbackProductCreation(result.product.id);
        } catch (rollbackError) {
          logger.error("Failed to rollback product creation:", rollbackError);
        }
      }

      throw error;
    }
  }

  /**
   * Validate comprehensive product data before creation
   */
  async validateComprehensiveProductData(data) {
    const { productData, brandData, retailerData, variants, categories } = data;

    // Validate product data
    if (!productData) {
      throw new AppError("Product data is required", 400);
    }

    if (productData.basePrice < 0) {
      throw new AppError("Product price cannot be negative", 400);
    }

    const validTypes = ["bookset", "uniform", "stationary", "general"];
    if (!validTypes.includes(productData.productType)) {
      throw new AppError(
        `Invalid product type. Must be one of: ${validTypes.join(", ")}`,
        400
      );
    }

    // Validate brand data if provided
    if (brandData) {
      if (brandData.type === "existing" && !brandData.brandId) {
        throw new AppError("Brand ID is required for existing brand", 400);
      }
      if (brandData.type === "new" && !brandData.name) {
        throw new AppError("Brand name is required for new brand", 400);
      }
      if (brandData.type === "existing") {
        const existingBrand = await this.brandRepository.findById(
          brandData.brandId
        );
        if (!existingBrand) {
          throw new AppError("Selected brand does not exist", 404);
        }
      }
    }

    // Validate retailer data if provided
    if (retailerData) {
      if (retailerData.type === "existing" && !retailerData.retailerId) {
        throw new AppError(
          "Retailer ID is required for existing retailer",
          400
        );
      }
      if (retailerData.type === "new" && !retailerData.name) {
        throw new AppError("Retailer name is required for new retailer", 400);
      }
    }

    // Validate variants if provided
    if (variants && variants.length > 0) {
      for (const variant of variants) {
        if (variant.price !== undefined && variant.price < 0) {
          throw new AppError("Variant price cannot be negative", 400);
        }
        if (variant.stock !== undefined && variant.stock < 0) {
          throw new AppError("Variant stock cannot be negative", 400);
        }
      }
    }

    return true;
  }

  /**
   * Rollback product creation in case of failure
   */
  async rollbackProductCreation(productId) {
    try {
      logger.info("Starting product creation rollback", { productId });

      // Delete associated data first (foreign key constraints)
      await this.productRepository.deleteProductImage(productId); // Delete all images
      await this.productRepository.removeProductBrand(productId); // Remove brand associations
      await this.productRepository.delete(productId); // Soft delete the product

      logger.info("Product creation rollback completed", { productId });
      return true;
    } catch (error) {
      logger.error("Error during product creation rollback:", error);
      throw error;
    }
  }

  /**
   * Get product by ID with complete details
   */
  async getProduct(productId) {
    try {
      console.log("Fetching product with ID:", productId);
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      // Enhance with images and brands for better user experience
      try {
        // Get product images (including variant images)
        const images = await this.productRepository.getProductImages(
          productId,
          {
            includeVariantImages: true,
          }
        );

        product.images = images;

        // Group images by variant for easier access
        product.imagesByVariant = {};
        product.mainImages = [];

        for (const image of images) {
          if (image.variantId) {
            if (!product.imagesByVariant[image.variantId]) {
              product.imagesByVariant[image.variantId] = [];
            }
            product.imagesByVariant[image.variantId].push(image);
          } else {
            product.mainImages.push(image);
          }
        }

        // Get primary image
        const primaryImage = images.find((img) => img.isPrimary);
        product.primaryImage = primaryImage || images[0] || null;
      } catch (imageError) {
        logger.warn("Error fetching product images:", imageError);
        product.images = [];
        product.mainImages = [];
        product.imagesByVariant = {};
        product.primaryImage = null;
      }

      // Get brand details if available
      if (product.brands && product.brands.length > 0) {
        try {
          const enhancedBrands = await this.productRepository.getProductBrands(
            productId
          );
          product.brandDetails = enhancedBrands;
        } catch (brandError) {
          logger.warn("Error fetching brand details:", brandError);
          product.brandDetails = product.brands; // Fallback to basic brand info
        }
      } else {
        product.brandDetails = [];
      }

      return product;
    } catch (error) {
      logger.error("Error getting product:", error);
      throw error;
    }
  }

  /**
   * Search products with enhanced filtering
   */
  async searchProducts(filters) {
    try {
      // Validate price range
      if (
        filters.minPrice &&
        filters.maxPrice &&
        filters.minPrice > filters.maxPrice
      ) {
        throw new AppError(
          "Minimum price cannot be greater than maximum price",
          400
        );
      }

      // Validate product type if provided
      if (filters.productType) {
        const validTypes = ["bookset", "uniform", "stationary", "general"];
        if (!validTypes.includes(filters.productType)) {
          throw new AppError(
            `Invalid product type. Must be one of: ${validTypes.join(", ")}`,
            400
          );
        }
      }

      // Validate pagination parameters
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));

      const searchFilters = {
        ...filters,
        page,
        limit,
      };

      return await this.productRepository.search(searchFilters);
    } catch (error) {
      logger.error("Error searching products:", error);
      throw error;
    }
  }

  /**
   * Update product with enhanced validation
   */
  async updateProduct(productId, updateData) {
    try {
      const existingProduct = await this.productRepository.findById(productId);
      if (!existingProduct) {
        throw new AppError("Product not found", 404);
      }

      // Validate business rules
      if (updateData.basePrice !== undefined && updateData.basePrice < 0) {
        throw new AppError("Product price cannot be negative", 400);
      }

      if (updateData.productType) {
        const validTypes = ["bookset", "uniform", "stationary", "general"];
        if (!validTypes.includes(updateData.productType)) {
          throw new AppError(
            `Invalid product type. Must be one of: ${validTypes.join(", ")}`,
            400
          );
        }
      }

      return await this.productRepository.update(productId, updateData);
    } catch (error) {
      logger.error("Error updating product:", error);
      throw error;
    }
  }

  /**
   * Update a comprehensive product with all related data atomically
   * This method ensures all operations succeed or all fail (ACID compliance)
   */
  async updateComprehensiveProduct(productId, data) {
    const {
      productData,
      images = [],
      brandData = null,
      retailerData = null,
      variants = [],
      categories = [],
    } = data;

    // Declare result outside try block to fix scoping issue
    let result = {
      product: null,
      images: [],
      brands: [],
      retailer: null,
      variants: [],
      categories: [],
      errors: [],
    };

    try {
      // Step 1: Validate product exists and input data
      const existingProduct = await this.productRepository.findById(productId);
      if (!existingProduct) {
        throw new AppError("Product not found", 404);
      }

      await this.validateComprehensiveProductData(data);

      // Step 2: Update the main product
      if (productData) {
        result.product = await this.productRepository.update(productId, {
          ...productData,
          categoryIds: categories.map((c) => c.id).filter(Boolean),
        });
        logger.info("Product updated in comprehensive operation", {
          productId,
        });
      } else {
        result.product = existingProduct;
      }

      // Step 3: Handle brand updates
      if (brandData) {
        try {
          // First remove existing brand associations if updating
          if (brandData.removeExisting) {
            await this.productRepository.removeAllProductBrands(productId);
          }

          if (brandData.type === "new") {
            // Create new brand and associate
            const newBrand = await this.brandRepository.create({
              name: brandData.name,
              slug:
                brandData.slug ||
                brandData.name.toLowerCase().replace(/\s+/g, "-"),
              description: brandData.description,
              country: brandData.country,
              logoUrl: brandData.logoUrl,
              metadata: brandData.metadata || {},
            });

            await this.productRepository.addProductBrand(productId, {
              brandId: newBrand.id,
              isPrimary: true,
            });

            result.brands.push(newBrand);
            logger.info("New brand created and associated in update", {
              brandId: newBrand.id,
              productId,
            });
          } else if (brandData.type === "existing" && brandData.brandId) {
            // Associate with existing brand
            await this.productRepository.addProductBrand(productId, {
              brandId: brandData.brandId,
              isPrimary: true,
            });

            const existingBrand = await this.brandRepository.findById(
              brandData.brandId
            );
            result.brands.push(existingBrand);
            logger.info("Existing brand associated in update", {
              brandId: brandData.brandId,
              productId,
            });
          }
        } catch (brandError) {
          logger.error(
            "Error handling brand in comprehensive product update:",
            brandError
          );
          result.errors.push(`Brand operation failed: ${brandError.message}`);
        }
      }

      // Step 4: Handle retailer updates
      if (retailerData) {
        try {
          if (retailerData.type === "new") {
            const retailerResult =
              await this.productRepository.addRetailerDetails(productId, {
                name: retailerData.name,
                contact_email: retailerData.contact_email,
                contact_phone: retailerData.contact_phone,
                address: retailerData.address,
                website: retailerData.website,
                is_verified: retailerData.is_verified || false,
                metadata: retailerData.metadata || {},
              });

            result.retailer = {
              id: retailerResult.retailerId,
              message: retailerResult.message,
            };
          } else if (
            retailerData.type === "existing" &&
            retailerData.retailerId
          ) {
            const retailerResult =
              await this.productRepository.addRetailerDetails(productId, {
                retailerId: retailerData.retailerId,
              });

            result.retailer = {
              id: retailerData.retailerId,
              message: retailerResult.message,
            };
          }
        } catch (retailerError) {
          logger.error(
            "Error handling retailer in comprehensive product update:",
            retailerError
          );
          result.errors.push(
            `Retailer operation failed: ${retailerError.message}`
          );
        }
      }

      // Step 5: Handle variant updates
      if (variants && variants.length > 0) {
        // Option to clear existing variants first
        if (data.replaceVariants) {
          try {
            // Delete existing variants
            const existingVariants =
              await this.productVariantRepository.findByProductId(productId);
            for (const variant of existingVariants) {
              await this.productVariantRepository.delete(variant.id);
            }
            logger.info("Existing variants cleared for update", { productId });
          } catch (variantDeleteError) {
            logger.error(
              "Error clearing existing variants:",
              variantDeleteError
            );
            result.errors.push(
              `Failed to clear existing variants: ${variantDeleteError.message}`
            );
          }
        }

        // Create or update variants
        for (const variantData of variants) {
          try {
            let variant;
            if (variantData.id && !data.replaceVariants) {
              // Update existing variant
              variant = await this.productVariantRepository.update(
                variantData.id,
                {
                  ...variantData,
                  productId,
                }
              );
              logger.info("Variant updated", {
                variantId: variant.id,
                productId,
              });
            } else {
              // Create new variant
              variant = await this.productVariantRepository.create({
                productId,
                ...variantData,
              });
              logger.info("Variant created in update", {
                variantId: variant.id,
                productId,
              });
            }
            result.variants.push(variant);
          } catch (variantError) {
            logger.error(
              "Error handling variant in comprehensive product update:",
              variantError
            );
            result.errors.push(
              `Variant operation failed: ${variantError.message}`
            );
          }
        }
      }

      // Step 6: Handle image updates
      if (images && images.length > 0) {
        // Option to clear existing images first
        if (data.replaceImages) {
          try {
            await this.productRepository.deleteAllProductImages(productId);
            logger.info("Existing images cleared for update", { productId });
          } catch (imageDeleteError) {
            logger.error("Error clearing existing images:", imageDeleteError);
            result.errors.push(
              `Failed to clear existing images: ${imageDeleteError.message}`
            );
          }
        }

        // Add new images
        for (const imageData of images) {
          try {
            const image = await this.productRepository.addProductImage(
              productId,
              {
                url: imageData.url,
                file: imageData.file,
                variantId: imageData.variantId || null,
                altText: imageData.altText,
                sortOrder: imageData.sortOrder || 0,
                isPrimary: imageData.isPrimary || false,
                imageType: imageData.imageType || "product",
                metadata: imageData.metadata || {},
              }
            );
            result.images.push(image);
            logger.info("Image updated", {
              imageId: image.id,
              productId,
              url: imageData.url,
            });
          } catch (imageError) {
            logger.error(
              "Error updating image in comprehensive product update:",
              imageError
            );
            result.errors.push(`Image update failed: ${imageError.message}`);
          }
        }
      }

      // Step 7: Get final updated product with all details
      const updatedProduct = await this.productRepository.getProductWithDetails(
        productId,
        {
          includeImages: true,
          includeVariantImages: true,
          includeBrandDetails: true,
          includeRetailerDetails: true,
        }
      );

      result.product = updatedProduct;

      // Log the comprehensive operation completion
      logger.info("Comprehensive product update completed successfully", {
        productId,
        imagesUpdated: result.images.length,
        brandsAssociated: result.brands.length,
        hasRetailer: !!result.retailer,
        variantsUpdated: result.variants.length,
        errorCount: result.errors.length,
      });

      // If there were any non-critical errors, include them in the response
      if (result.errors.length > 0) {
        logger.warn("Comprehensive product update had some errors", {
          productId,
          errors: result.errors,
        });
      }

      return result;
    } catch (error) {
      logger.error("Critical error in comprehensive product update:", error);
      throw error;
    }
  }

  /**
   * Delete product (soft delete)
   */
  async deleteProduct(productId) {
    try {
      const existingProduct = await this.productRepository.findById(productId);
      if (!existingProduct) {
        throw new AppError("Product not found", 404);
      }

      return await this.productRepository.delete(productId);
    } catch (error) {
      logger.error("Error deleting product:", error);
      throw error;
    }
  }

  /**
   * Get products for a school with enhanced filtering
   */
  async getSchoolProducts(schoolId, filters = {}) {
    try {
      return await this.productRepository.getBySchool(schoolId, filters);
    } catch (error) {
      logger.error("Error getting school products:", error);
      throw error;
    }
  }

  /**
   * Get featured products with enhanced selection
   */
  async getFeaturedProducts(limit = 10) {
    try {
      const filters = {
        page: 1,
        limit: Math.min(50, Math.max(1, limit)),
        sortBy: "created_at",
        sortOrder: "desc",
      };

      const result = await this.productRepository.search(filters);
      return result.products;
    } catch (error) {
      logger.error("Error getting featured products:", error);
      throw error;
    }
  }

  /**
   * Get products by category with enhanced features
   */
  async getProductsByCategory(categorySlug, filters = {}) {
    try {
      return await this.productRepository.search({
        ...filters,
        categorySlug: categorySlug,
      });
    } catch (error) {
      logger.error("Error getting products by category:", error);
      throw error;
    }
  }

  /**
   * Get products by brand
   */
  async getProductsByBrand(brandId, filters = {}) {
    try {
      // Verify brand exists
      const brand = await this.brandRepository.findById(brandId);
      if (!brand) {
        throw new AppError("Brand not found", 404);
      }

      return await this.productRepository.search({
        ...filters,
        brand: brandId,
      });
    } catch (error) {
      logger.error("Error getting products by brand:", error);
      throw error;
    }
  }

  /**
   * Get products by type with validation
   */
  async getProductsByType(productType, filters = {}) {
    try {
      // Validate product type
      const validTypes = ["bookset", "uniform", "stationary", "general"];
      if (!validTypes.includes(productType)) {
        throw new AppError(
          `Invalid product type. Must be one of: ${validTypes.join(", ")}`,
          400
        );
      }

      return await this.productRepository.search({
        ...filters,
        productType,
      });
    } catch (error) {
      logger.error("Error getting products by type:", error);
      throw error;
    }
  }

  /**
   * Check product availability with enhanced variant support
   */
  async checkAvailability(productId, variantId = null, quantity = 1) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      console.log("Checking availability for product:", product);

      if (!product.is_active) {
        return {
          available: false,
          reason: "Product is not active",
          availableQuantity: 0,
        };
      }

      // If variant specified, check variant stock
      if (variantId) {
        const variant = product.variants.find((v) => v.id === variantId);
        if (!variant) {
          throw new AppError("Product variant not found", 404);
        }

        const isAvailable = variant.stock >= quantity;

        return {
          available: isAvailable,
          reason: isAvailable
            ? "Product variant is available"
            : "Insufficient stock",
          availableQuantity: variant.stock,
          stock: variant.stock, // Add both for compatibility
          variant: {
            id: variant.id,
            sku: variant.sku,
            price: variant.price || product.basePrice,
            availableQuantity: variant.stock,
          },
        };
      }

      // Check if product has variants but none specified
      if (product.variants && product.variants.length > 0) {
        const totalStock = product.variants.reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );

        const isAvailable = totalStock >= quantity;

        return {
          available: isAvailable,
          reason: isAvailable
            ? "Product is available in variants"
            : "Insufficient stock across all variants",
          availableQuantity: totalStock,
          stock: totalStock, // Add both for compatibility
          totalStock,
          variants: product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            price: v.price || product.basePrice,
            stock: v.stock,
            optionValues: v.optionValues,
          })),
        };
      }

      // For products without variants, use product stock
      const productStock = product.stock || 0;
      const isAvailable = productStock >= quantity;

      return {
        available: isAvailable,
        reason: isAvailable ? "Product is available" : "Insufficient stock",
        availableQuantity: productStock,
        stock: productStock, // Add both for compatibility
      };
    } catch (error) {
      logger.error("Error checking availability:", error);
      throw error;
    }
  }

  /**
   * Get product options and values
   */
  async getProductOptions(productId) {
    try {
      const product = await this.productRepository.findById(productId);
      console.log("Product fetched for options:", product);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      return await this.productOptionRepository.findProductOptionsStructure(
        productId
      );
    } catch (error) {
      logger.error("Error getting product options:", error);
      throw error;
    }
  }

  /**
   * Add product option attribute
   */
  async addProductOption(productId, optionData) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      return await this.productOptionRepository.createAttribute({
        productId,
        ...optionData,
      });
    } catch (error) {
      logger.error("Error adding product option:", error);
      throw error;
    }
  }

  /**
   * Add product option value
   */
  async addProductOptionValue(attributeId, valueData) {
    try {
      const attribute = await this.productOptionRepository.findAttributeById(
        attributeId
      );
      if (!attribute) {
        throw new AppError("Product option attribute not found", 404);
      }

      return await this.productOptionRepository.createValue({
        attributeId,
        ...valueData,
      });
    } catch (error) {
      logger.error("Error adding product option value:", error);
      throw error;
    }
  }

  /**
   * Update product option attribute
   */
  async updateProductOption(attributeId, updateData) {
    try {
      const attribute = await this.productOptionRepository.findAttributeById(
        attributeId
      );
      if (!attribute) {
        throw new AppError("Product option attribute not found", 404);
      }

      return await this.productOptionRepository.updateAttribute(
        attributeId,
        updateData
      );
    } catch (error) {
      logger.error("Error updating product option:", error);
      throw error;
    }
  }

  /**
   * Update product option value
   */
  async updateProductOptionValue(valueId, updateData) {
    try {
      const value = await this.productOptionRepository.findValueById(valueId);
      if (!value) {
        throw new AppError("Product option value not found", 404);
      }

      return await this.productOptionRepository.updateValue(valueId, updateData);
    } catch (error) {
      logger.error("Error updating product option value:", error);
      throw error;
    }
  }

  /**
   * Delete product option attribute
   */
  async deleteProductOption(attributeId) {
    try {
      const attribute = await this.productOptionRepository.findAttributeById(
        attributeId
      );
      if (!attribute) {
        throw new AppError("Product option attribute not found", 404);
      }

      return await this.productOptionRepository.deleteAttribute(attributeId);
    } catch (error) {
      logger.error("Error deleting product option:", error);
      throw error;
    }
  }

  /**
   * Delete product option value
   */
  async deleteProductOptionValue(valueId) {
    try {
      const value = await this.productOptionRepository.findValueById(valueId);
      if (!value) {
        throw new AppError("Product option value not found", 404);
      }

      return await this.productOptionRepository.deleteValue(valueId);
    } catch (error) {
      logger.error("Error deleting product option value:", error);
      throw error;
    }
  }

  /**
   * Get product statistics
   */
  async getProductStats(filters = {}) {
    try {
      const totalCount = await this.productRepository.count(filters);

      const typeStats = {};
      const validTypes = ["bookset", "uniform", "stationary", "general"];

      for (const type of validTypes) {
        typeStats[type] = await this.productRepository.count({
          ...filters,
          productType: type,
        });
      }

      return {
        totalProducts: totalCount,
        byType: typeStats,
      };
    } catch (error) {
      logger.error("Error getting product statistics:", error);
      throw error;
    }
  }

  /**
   * Bulk update products
   */
  async bulkUpdateProducts(updates) {
    try {
      const results = [];

      for (const update of updates) {
        const { productId, ...updateData } = update;

        try {
          const result = await this.updateProduct(productId, updateData);
          results.push({ productId, success: true, data: result });
        } catch (error) {
          results.push({
            productId,
            success: false,
            error: error.message,
          });
        }
      }

      return {
        results,
        summary: {
          total: updates.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        },
      };
    } catch (error) {
      logger.error("Error in bulk update:", error);
      throw error;
    }
  }

  // ============ PRODUCT VARIANT METHODS ============

  /**
   * Create a new product variant
   */
  async createVariant(productId, variantData) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      // Validate business rules
      if (variantData.price !== undefined && variantData.price < 0) {
        throw new AppError("Variant price cannot be negative", 400);
      }

      if (variantData.stock !== undefined && variantData.stock < 0) {
        throw new AppError("Variant stock cannot be negative", 400);
      }

      return await this.productVariantRepository.create({
        productId,
        ...variantData,
      });
    } catch (error) {
      logger.error("Error creating product variant:", error);
      throw error;
    }
  }

  /**
   * Get variant by ID
   */
  async getVariant(variantId) {
    try {
      const variant = await this.productVariantRepository.findById(variantId);
      if (!variant) {
        throw new AppError("Product variant not found", 404);
      }

      return variant;
    } catch (error) {
      logger.error("Error getting variant:", error);
      throw error;
    }
  }

  /**
   * Get all variants for a product
   */
  async getProductVariants(productId) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      return await this.productRepository.findById(productId);
    } catch (error) {
      logger.error("Error getting product variants:", error);
      throw error;
    }
  }

  /**
   * Get images for a product (includes variant-specific images)
   */
  async getProductImages(productId, variantId = null) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      // If variantId is provided, validate it belongs to this product
      if (variantId) {
        const variant = await this.productVariantRepository.findById(variantId);
        if (!variant || variant.productId !== productId) {
          throw new AppError(
            "Product variant not found or doesn't belong to this product",
            404
          );
        }
      }

      // Get images using ProductImageRepository
      const images = await ProductImageRepository.getProductImages(
        productId,
        variantId
      );

      return images;
    } catch (error) {
      logger.error("Error getting product images:", error);
      throw error;
    }
  }

  /**
   * Update variant
   */
  async updateVariant(variantId, updateData) {
    try {
      const existingVariant = await this.productVariantRepository.findById(
        variantId
      );
      if (!existingVariant) {
        throw new AppError("Product variant not found", 404);
      }

      // Validate business rules
      if (updateData.price !== undefined && updateData.price < 0) {
        throw new AppError("Variant price cannot be negative", 400);
      }

      if (updateData.stock !== undefined && updateData.stock < 0) {
        throw new AppError("Variant stock cannot be negative", 400);
      }

      return await this.productVariantRepository.update(variantId, updateData);
    } catch (error) {
      logger.error("Error updating variant:", error);
      throw error;
    }
  }

  /**
   * Delete variant
   */
  async deleteVariant(variantId) {
    try {
      const existingVariant = await this.productVariantRepository.findById(
        variantId
      );
      if (!existingVariant) {
        throw new AppError("Product variant not found", 404);
      }

      return await this.productVariantRepository.delete(variantId);
    } catch (error) {
      logger.error("Error deleting variant:", error);
      throw error;
    }
  }

  /**
   * Update variant stock
   */
  async updateVariantStock(variantId, quantity, operation = "set") {
    try {
      const existingVariant = await this.productVariantRepository.findById(
        variantId
      );
      if (!existingVariant) {
        throw new AppError("Product variant not found", 404);
      }

      if (quantity < 0) {
        throw new AppError("Stock quantity cannot be negative", 400);
      }

      // For decrement operation, check if we have enough stock
      if (operation === "decrement" && existingVariant.stock < quantity) {
        throw new AppError(
          `Insufficient stock. Available: ${existingVariant.stock}, Requested: ${quantity}`,
          400
        );
      }

      return await this.productVariantRepository.updateStock(
        variantId,
        quantity,
        operation
      );
    } catch (error) {
      logger.error("Error updating variant stock:", error);
      throw error;
    }
  }

  /**
   * Search variants with filters
   */
  async searchVariants(filters = {}) {
    try {
      // Validate price range
      if (
        filters.minPrice &&
        filters.maxPrice &&
        filters.minPrice > filters.maxPrice
      ) {
        throw new AppError(
          "Minimum price cannot be greater than maximum price",
          400
        );
      }

      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));

      return await this.productVariantRepository.search({
        ...filters,
        page,
        limit,
      });
    } catch (error) {
      logger.error("Error searching variants:", error);
      throw error;
    }
  }

  /**
   * Bulk update variant stocks (for inventory management)
   */
  async bulkUpdateVariantStocks(updates) {
    try {
      const results = [];
      const summary = {
        total: updates.length,
        successful: 0,
        failed: 0,
      };

      for (const update of updates) {
        try {
          const { variantId, quantity, operation = "set" } = update;

          if (!variantId || quantity === undefined) {
            throw new AppError("Variant ID and quantity are required", 400);
          }

          const variant = await this.updateVariantStock(
            variantId,
            quantity,
            operation
          );

          results.push({
            variantId,
            success: true,
            variant,
          });
          summary.successful++;
        } catch (error) {
          results.push({
            variantId: update.variantId || "unknown",
            success: false,
            error: error.message,
          });
          summary.failed++;
        }
      }

      return { results, summary };
    } catch (error) {
      logger.error("Error bulk updating variant stocks:", error);
      throw error;
    }
  }

  // ============ PRODUCT IMAGE MANAGEMENT METHODS ============

  /**
   * Add product image (supports both file upload and URL)
   */
  async addProductImage(productId, imageData) {
    try {
      return await this.productRepository.addProductImage(productId, imageData);
    } catch (error) {
      logger.error("Error adding product image:", error);
      throw error;
    }
  }

  /**
   * Add multiple product images
   */
  async addProductImages(productId, imagesData) {
    try {
      return await this.productRepository.addProductImages(
        productId,
        imagesData
      );
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
      return await this.productRepository.updateProductImage(
        imageId,
        updateData
      );
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
      return await this.productRepository.deleteProductImage(imageId);
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
      return await this.productRepository.setPrimaryImage(
        imageId,
        productId,
        variantId
      );
    } catch (error) {
      logger.error("Error setting primary image:", error);
      throw error;
    }
  }

  /**
   * Get variant images
   */
  async getVariantImages(variantId) {
    try {
      return await this.productRepository.getVariantImages(variantId);
    } catch (error) {
      logger.error("Error getting variant images:", error);
      throw error;
    }
  }

  /**
   * Bulk upload variant images
   */
  async bulkUploadVariantImages(productId, variantImagesData) {
    try {
      return await this.productRepository.bulkUploadVariantImages(
        productId,
        variantImagesData
      );
    } catch (error) {
      logger.error("Error bulk uploading variant images:", error);
      throw error;
    }
  }

  // ============ BRAND MANAGEMENT METHODS ============

  /**
   * Add brand to product
   */
  async addProductBrand(productId, brandData) {
    try {
      return await this.productRepository.addProductBrand(productId, brandData);
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
      return await this.productRepository.removeProductBrand(
        productId,
        brandId
      );
    } catch (error) {
      logger.error("Error removing product brand:", error);
      throw error;
    }
  }

  /**
   * Get product brands
   */
  async getProductBrands(productId) {
    try {
      return await this.productRepository.getProductBrands(productId);
    } catch (error) {
      logger.error("Error getting product brands:", error);
      throw error;
    }
  }

  // ============ RETAILER MANAGEMENT METHODS ============

  /**
   * Add retailer details to product
   */
  async addRetailerDetails(productId, retailerData) {
    try {
      return await this.productRepository.addRetailerDetails(
        productId,
        retailerData
      );
    } catch (error) {
      logger.error("Error adding retailer details:", error);
      throw error;
    }
  }

  /**
   * Update retailer details for product
   */
  async updateRetailerDetails(productId, retailerData) {
    try {
      // This method would update existing retailer or create new one
      // Similar to addRetailerDetails but for updates
      return await this.productRepository.addRetailerDetails(productId, {
        ...retailerData,
        isUpdate: true,
      });
    } catch (error) {
      logger.error("Error updating retailer details:", error);
      throw error;
    }
  }

  /**
   * Remove retailer from product
   */
  async removeRetailerDetails(productId) {
    try {
      return await this.productRepository.removeRetailerDetails(productId);
    } catch (error) {
      logger.error("Error removing retailer details:", error);
      throw error;
    }
  }

  // ============ COMPREHENSIVE DATA METHODS ============

  /**
   * Get product with all details (images, brands, retailer)
   */
  async getProductWithDetails(productId, options = {}) {
    try {
      return await this.productRepository.getProductWithDetails(
        productId,
        options
      );
    } catch (error) {
      logger.error("Error getting product with details:", error);
      throw error;
    }
  }

  /**
   * Get product analytics and insights
   */
  async getProductAnalytics(productId) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      // Get comprehensive analytics data
      const analytics = {
        productInfo: {
          id: product.id,
          title: product.title,
          sku: product.sku,
          createdAt: product.created_at,
        },
        imageStats: {
          totalImages: 0,
          mainImages: 0,
          variantImages: 0,
          imagesByVariant: {},
        },
        variantStats: {
          totalVariants: product.variants?.length || 0,
          variantsWithImages: 0,
          averagePrice: 0,
          totalStock: 0,
        },
        brandInfo: {
          totalBrands: product.brands?.length || 0,
          brands: product.brands || [],
        },
        retailerInfo: product.retailerId
          ? {
              hasRetailer: true,
              retailerId: product.retailerId,
              retailerName: product.retailerName,
            }
          : {
              hasRetailer: false,
            },
      };

      // Get detailed image statistics
      const images = await this.productRepository.getProductImages(productId, {
        includeVariantImages: true,
      });

      analytics.imageStats.totalImages = images.length;

      for (const image of images) {
        if (image.variantId) {
          analytics.imageStats.variantImages++;
          if (!analytics.imageStats.imagesByVariant[image.variantId]) {
            analytics.imageStats.imagesByVariant[image.variantId] = 0;
          }
          analytics.imageStats.imagesByVariant[image.variantId]++;
        } else {
          analytics.imageStats.mainImages++;
        }
      }

      // Calculate variant statistics
      if (product.variants?.length > 0) {
        const prices = product.variants.map((v) => v.price || 0);
        const stocks = product.variants.map((v) => v.stock || 0);

        analytics.variantStats.averagePrice =
          prices.reduce((a, b) => a + b, 0) / prices.length;
        analytics.variantStats.totalStock = stocks.reduce((a, b) => a + b, 0);
        analytics.variantStats.variantsWithImages = Object.keys(
          analytics.imageStats.imagesByVariant
        ).length;
      }

      return analytics;
    } catch (error) {
      logger.error("Error getting product analytics:", error);
      throw error;
    }
  }
}

const productService = new ProductService();
export default productService;
