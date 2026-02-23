import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import ProductRepository from "../repositories/productRepository.js";
import BrandRepository from "../repositories/brandRepository.js";
import ProductOptionRepository from "../repositories/productOptionRepository.js";
import ProductVariantRepository from "../repositories/productVariantRepository.js";
import ProductImageRepository from "../repositories/productImageRepository.js";
import WarehouseRepository from "../repositories/warehouseRepository.js";
import { SchoolRepository } from "../repositories/schoolRepository.js";
import { productPaymentMethodRepository } from "../repositories/productPaymentMethodRepository.js";
import { variantCommissionRepository } from "../repositories/variantCommissionRepository.js";

/**
 * Product Service
 * Handles product management business logic with enhanced schema support
 */
export class ProductService {
  constructor(
    productRepository,
    brandRepository,
    productOptionRepository,
    productVariantRepository,
    schoolRepository,
    paymentMethodRepo,
  ) {
    this.productRepository = productRepository || ProductRepository;
    this.brandRepository = brandRepository || BrandRepository;
    this.productOptionRepository =
      productOptionRepository || ProductOptionRepository;
    this.productVariantRepository =
      productVariantRepository || ProductVariantRepository;
    this.schoolRepository = schoolRepository || new SchoolRepository();
    this.productPaymentMethodRepository = paymentMethodRepo || productPaymentMethodRepository;
    this.variantCommissionRepository = variantCommissionRepository;
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
          400,
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
   * This method uses a database stored procedure for ACID compliance
   */
  async createComprehensiveProduct(data) {
    try {
      // Step 1: Validate all input data first
      await this.validateComprehensiveProductData(data);

      logger.info("Starting comprehensive product creation via RPC");

      // Step 2: Call the RPC via repository
      // The payload structure might need adjustment depending on exactly what keys are in 'data' vs what SQL expects
      // SQL expects: productData, brandData, warehouseData, retailerId, categories, variants, images
      // Pre-create warehouse if it's new (since RPC might not handle new warehouse creation with address complexity)
      if (data.warehouseData && data.warehouseData.type === "new") {
        try {
          // Use the validated data
          const newWarehouse = await WarehouseRepository.create(
            data.warehouseData,
          ); // Token is optional/handled
          logger.info("Created new warehouse for comprehensive product", {
            warehouseId: newWarehouse.id,
          });

          // Update data to point to existing warehouse
          data.warehouseData = {
            warehouseId: newWarehouse.id,
            type: "existing", // ensure downstream treats it as existing
          };
        } catch (err) {
          logger.error(
            "Failed to create new warehouse during comprehensive product creation",
            err,
          );
          throw err;
        }
      }

      const payload = {
        productData: data.productData,
        brandData: data.brandData,
        warehouseData: data.warehouseData,
        retailerId: data.retailerId,
        categories: data.categories,
        variants: data.variants,
        images: data.images,
        productOptions: data.productOptions,
        schoolData: data.schoolData,
        productType: data.productType,
        paymentMethods: data.paymentMethods,
      };

      const result =
        await this.productRepository.createComprehensiveProductViaRPC(payload);

      const productId = result.product_id;
      logger.info("Comprehensive product creation completed via RPC", {
        productId,
      });

      // Step 3: Fetch the fully created product to return consistent response format
      return await this.productRepository.getProductWithDetails(productId, {
        includeImages: true,
        includeVariantImages: true,
        includeBrandDetails: true,
        includeWarehouseDetails: true,
      });
    } catch (error) {
      logger.error("Error in comprehensive product creation:", error);
      throw error;
    }
  }

  /**
   * Validate comprehensive product data before creation
   */
  async validateComprehensiveProductData(data) {
    const { productData, brandData, warehouseData, variants, categories } =
      data;

    // Validate product data
    if (!productData) {
      throw new AppError("Product data is required", 400);
    }

    if (productData.basePrice < 0) {
      throw new AppError("Product price cannot be negative", 400);
    }

    const validTypes = [
      "bookset",
      "uniform",
      "stationary",
      "school",
      "general",
    ];
    if (!validTypes.includes(productData.productType)) {
      throw new AppError(
        `Invalid product type. Must be one of: ${validTypes.join(", ")}`,
        400,
      );
    }

    if (!productData.city) {
      throw new AppError("City is required for product", 400);
    }

    // Validate warehouse data is required
    if (!warehouseData) {
      throw new AppError("Warehouse information is required for product", 400);
    }
    if (brandData) {
      if (brandData.type === "existing" && !brandData.brandId) {
        throw new AppError("Brand ID is required for existing brand", 400);
      }
      if (brandData.type === "new" && !brandData.name) {
        throw new AppError("Brand name is required for new brand", 400);
      }
      if (brandData.type === "existing") {
        const existingBrand = await this.brandRepository.findById(
          brandData.brandId,
        );
        if (!existingBrand) {
          throw new AppError("Selected brand does not exist", 404);
        }
      }
    }

    // Validate warehouse data if provided
    if (warehouseData) {
      if (warehouseData.type === "existing" && !warehouseData.warehouseId) {
        throw new AppError(
          "Warehouse ID is required for existing warehouse",
          400,
        );
      }
      if (warehouseData.type === "new" && !warehouseData.name) {
        throw new AppError("Warehouse name is required for new warehouse", 400);
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
          },
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
          const enhancedBrands =
            await this.productRepository.getProductBrands(productId);
          product.brandDetails = enhancedBrands;
        } catch (brandError) {
          logger.warn("Error fetching brand details:", brandError);
          product.brandDetails = product.brands; // Fallback to basic brand info
        }
      } else {
        product.brandDetails = [];
      }

      // Fetch payment methods
      try {
        product.paymentMethods = await this.productPaymentMethodRepository.getPaymentMethods(productId);
      } catch (pmErr) {
        logger.warn("Error fetching payment methods:", pmErr);
        product.paymentMethods = [];
      }

      return product;
    } catch (error) {
      logger.error("Error getting product:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive product by ID, perfectly formatted for the Admin/Retailer dashboards
   */
  async getComprehensiveProduct(productId) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      console.log("Product found:", product);
      // We'll reconstruct the same shape the frontend sends in `createComprehensiveProduct`
      const result = {
        productData: {
          title: product.title || "",
          sku: product.sku || "",
          basePrice: product.base_price || 0,
          compareAtPrice:
            product.compare_at_price || product.metadata?.compare_price || "",
          shortDescription: product.short_description || "",
          description: product.description || "",
          city: product.city || "",
          isActive: product.is_active,
          categoryAttributes: product.metadata?.categoryAttributes || {},
        },
        productType: product.product_type || "general",
        images: [],
        brandData: null,
        warehouseData: null,
        categories: [],
        highlights: [],
        metadata: product.metadata || {},
        variants: [],
        productOptions: [],
        schoolData: null,
        paymentMethods: [],
      };

      // Extract brands
      if (product.brands && product.brands.length > 0) {
        const primaryBrand = product.brands[0];
        result.brandData = {
          brandId: primaryBrand.id,
          name: primaryBrand.name,
          type: "existing",
        };
      } else if (product.product_brands && product.product_brands.length > 0) {
        const primaryBrand = product.product_brands[0].brands;
        if (primaryBrand) {
          result.brandData = {
            brandId: primaryBrand.id,
            name: primaryBrand.name,
            type: "existing",
          };
        }
      }

      // Extract warehouse / retailer
      if (product.products_warehouse && product.products_warehouse.warehouse) {
        result.warehouseData = {
          warehouseId: product.products_warehouse.warehouse.id,
          name: product.products_warehouse.warehouse.name,
          type: "existing",
        };
      }

      // Extract categories
      if (product.categories && product.categories.length > 0) {
        result.categories = product.categories.map((c) => ({
          id: c.id,
          label: c.name,
        }));
      } else if (
        product.product_categories &&
        product.product_categories.length > 0
      ) {
        result.categories = product.product_categories
          .map((pc) => pc.categories)
          .filter(Boolean)
          .map((c) => ({
            id: c.id,
            label: c.name,
          }));
      }

      // Extract Highlights
      if (product.highlight) {
        result.highlights = Object.entries(product.highlight).map(
          ([key, value]) => ({ key, value }),
        );
      }

      // Extract school
      if (product.product_type !== "general") {
        try {
          const fetchedSchoolData =
            await this.schoolRepository.getSchoolForProduct(productId);
          if (fetchedSchoolData) {
            result.schoolData = fetchedSchoolData;
          }
        } catch (schoolErr) {
          logger.error(
            "Failed to fetch school data for comprehensive product",
            schoolErr,
          );
        }
      }

      if (!result.schoolData) {
        if (product.school) {
          // Sometimes injected manually
          result.schoolData = {
            schoolId: product.school.id,
            name: product.school.name,
            grade: product.schoolData?.grade || "",
            mandatory: product.schoolData?.mandatory || false,
          };
        } else if (product.products_school && product.products_school.school) {
          result.schoolData = {
            schoolId: product.products_school.school.id,
            name: product.products_school.school.name,
            grade: product.products_school.grade || "",
            mandatory: product.products_school.mandatory || false,
          };
        }
      }

      // Process options and variants natively
      if (product.variants && product.variants.length > 0) {
        const reconstructedOptions = [];

        // Helper to extract option structures
        const processOptionPosition = (pos) => {
          const refKey = `option_value_${pos}_ref`;
          const referenceVariant = product.variants.find((v) => v[refKey]);

          if (!referenceVariant) return;

          const attributeName = referenceVariant[refKey].attribute_name;
          const uniqueValuesMap = new Map();

          product.variants.forEach((variant) => {
            const ref = variant[refKey];
            if (ref && ref.value) {
              if (!uniqueValuesMap.has(ref.value)) {
                uniqueValuesMap.set(ref.value, {
                  value: ref.value,
                  imageUrl: ref.imageUrl || null,
                });
              }
            }
          });

          const hasImages = Array.from(uniqueValuesMap.values()).some(
            (v) => v.imageUrl,
          );

          reconstructedOptions.push({
            id: Date.now() + pos,
            name: attributeName,
            position: pos,
            hasImages,
            values: Array.from(uniqueValuesMap.values()).map((v) =>
              hasImages ? { value: v.value, imageUrl: v.imageUrl } : v.value,
            ),
          });
        };

        processOptionPosition(1);
        processOptionPosition(2);
        processOptionPosition(3);

        result.productOptions = reconstructedOptions;

        // Map variants
        result.variants = product.variants.map((v) => ({
          id: v.id,
          name: [
            v.option_value_1_ref?.value,
            v.option_value_2_ref?.value,
            v.option_value_3_ref?.value,
          ]
            .filter(Boolean)
            .join(" / "),
          sku: v.sku || "",
          price: v.variant_price || v.price,
          compareAtPrice:
            v.compare_at_price ||
            v.base_price ||
            v.metadata?.compare_price ||
            "",
          stock: v.stock || 0,
          options: {
            [v.option_value_1_ref?.attribute_name]: v.option_value_1_ref?.value,
            [v.option_value_2_ref?.attribute_name]: v.option_value_2_ref?.value,
            [v.option_value_3_ref?.attribute_name]: v.option_value_3_ref?.value,
          },
          image: v.imageUrl || null, // Map the resolved imageUrl to the variants for the grid
        }));
      }

      // Map images loosely (the frontend often pulls them from variants directly or the main product.images array)
      if (product.images && product.images.length > 0) {
        // Sort by sortOrder
        const sortedImages = [...product.images].sort(
          (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0),
        );
        result.images = sortedImages.map((img) => ({
          url: img.url,
          isPrimary: img.isPrimary,
        }));
      } else {
        try {
          const images = await this.productRepository.getProductImages(
            productId,
            { includeVariantImages: false },
          );
          result.images = images.map((img) => ({
            url: img.url,
            isPrimary: img.isPrimary,
          }));
        } catch (err) {
          // Silently fail if images error
        }
      }

      // Fetch payment methods
      try {
        result.paymentMethods = await this.productPaymentMethodRepository.getPaymentMethods(productId);
      } catch (pmErr) {
        logger.error("Failed to fetch payment methods", pmErr);
      }

      return result;
    } catch (error) {
      logger.error("Error getting comprehensive product:", error);
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
          400,
        );
      }

      // Validate product type if provided
      if (filters.productType) {
        const validTypes = [
          "bookset",
          "uniform",
          "stationary",
          "school",
          "general",
        ];
        if (!validTypes.includes(filters.productType)) {
          throw new AppError(
            `Invalid product type. Must be one of: ${validTypes.join(", ")}`,
            400,
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
   * Get products by retailer ID
   */
  async getProductsByRetailerId(retailerId, filters = {}) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }

      // Validate pagination
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));

      return await this.productRepository.findByRetailerId(retailerId, {
        ...filters,
        page,
        limit,
      });
    } catch (error) {
      logger.error("Error getting products by retailer ID:", error);
      throw error;
    }
  }

  /**
   * Get warehouse products
   */
  async getWarehouseProducts(warehouseId, queryParams) {
    try {
      if (!warehouseId) {
        throw new AppError("Warehouse ID is missing or invalid", 400);
      }

      // Validate pagination
      const page = Math.max(1, parseInt(queryParams.page) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(queryParams.limit) || 20),
      );

      return await this.productRepository.getProductsByWarehouseId(
        warehouseId,
        {
          ...queryParams,
          page,
          limit,
        },
      );
    } catch (error) {
      logger.error("Error getting warehouse products:", error);
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
            400,
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
  async updateComprehensiveProduct(productId, data, retailerId = null) {
    const {
      productData,
      images = [],
      brandData = null,
      warehouseData = null,
      variants = [],
      categories = [],
      productOptions = [],
      schoolData = null,
    } = data;

    // Declare result outside try block to fix scoping issue
    let result = {
      product: null,
      images: [],
      brands: [],
      retailer: null,
      variants: [],
      categories: [],
      productOptions: [],
      school: null,
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
          // First unconditionally remove existing brand associations if updating
          await this.productRepository.removeAllProductBrands(productId);

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
              brandData.brandId,
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
            brandError,
          );
          result.errors.push(`Brand operation failed: ${brandError.message}`);
        }
      }

      // Step 4: Handle warehouse updates
      if (warehouseData) {
        try {
          // Unlink existing warehouse first
          await this.productRepository.removeAllProductWarehouses(productId);

          if (warehouseData.type === "new") {
            const warehouseResult =
              await this.productRepository.addWarehouseDetails(
                productId,
                {
                  name: warehouseData.name,
                  contact_email: warehouseData.contact_email,
                  contact_phone: warehouseData.contact_phone,
                  address: warehouseData.address,
                  website: warehouseData.website,
                  is_verified: warehouseData.is_verified || false,
                  metadata: warehouseData.metadata || {},
                },
                data.retailerId,
              ); // Pass retailerId if available

            result.warehouse = {
              id: warehouseResult.warehouseId,
              message: warehouseResult.message,
            };
          } else if (
            warehouseData.type === "existing" &&
            warehouseData.warehouseId
          ) {
            const warehouseResult =
              await this.productRepository.addWarehouseDetails(
                productId,
                {
                  warehouseId: warehouseData.warehouseId,
                },
                data.retailerId,
              ); // Pass retailerId if available

            result.warehouse = {
              id: warehouseData.warehouseId,
              message: warehouseResult.message,
            };
          }
        } catch (warehouseError) {
          logger.error(
            "Error handling warehouse in comprehensive product update:",
            warehouseError,
          );
          result.errors.push(
            `Warehouse operation failed: ${warehouseError.message}`,
          );
        }
      }

      // Step 5: Handle product option updates
      let createdOptions = [];
      if (productOptions && productOptions.length > 0) {
        try {
          // Clear existing attributes
          const existingAttributes =
            await this.productOptionRepository.findAttributesByProductId(
              productId,
            );
          for (const attr of existingAttributes) {
            await this.productOptionRepository.deleteAttribute(attr.id);
          }
          logger.info("Existing options cleared for update", { productId });
        } catch (attrDeleteError) {
          logger.error("Error clearing existing options:", attrDeleteError);
        }

        for (const option of productOptions) {
          try {
            let attribute;
            // Create new attribute
            attribute = await this.productOptionRepository.createAttribute({
              productId,
              name: option.name,
              position: option.position,
              isRequired: option.isRequired,
            });

            let newOpt = { ...attribute, values: [] };

            // Handle option values
            if (option.values && option.values.length > 0) {
              const updatedValues = [];
              for (const value of option.values) {
                try {
                  let val;
                  // Create new value
                  val = await this.productOptionRepository.createValue({
                    attributeId: attribute.id,
                    value: value.value,
                    priceModifier: value.priceModifier,
                    sortOrder: value.sortOrder,
                    imageUrl: value.imageUrl,
                  });
                  updatedValues.push(val);
                } catch (valError) {
                  logger.error(
                    "Error handling option value in update:",
                    valError,
                  );
                  result.errors.push(
                    `Option value operation failed: ${valError.message}`,
                  );
                }
              }
              attribute.values = updatedValues;
              newOpt.values = updatedValues;
            }
            result.productOptions.push(attribute);
            createdOptions.push(newOpt);
          } catch (optError) {
            logger.error("Error handling product option in update:", optError);
            result.errors.push(
              `Product option operation failed: ${optError.message}`,
            );
          }
        }
      }

      // Step 6: Handle variant updates
      if (variants && variants.length > 0) {
        // Option to clear existing variants first - we do this ALWAYS now due to UI generating new variations
        try {
          // Delete existing variants
          const existingVariants =
            await this.productVariantRepository.findByProductId(productId);
          for (const variant of existingVariants) {
            await this.productVariantRepository.delete(variant.id);
          }
          logger.info("Existing variants cleared for update", { productId });
        } catch (variantDeleteError) {
          logger.error("Error clearing existing variants:", variantDeleteError);
          result.errors.push(
            `Failed to clear existing variants: ${variantDeleteError.message}`,
          );
        }

        // Create or update variants
        for (const variantData of variants) {
          try {
            // We need to resolve the option values from strings to IDs
            const getOptionValueId = (optName, valString) => {
              if (!valString || !optName) return null;
              const attr = createdOptions.find((o) => o.name === optName);
              if (!attr) return null;
              const val = attr.values.find((v) => v.value === valString);
              return val ? val.id : null;
            };

            const optionValue1 = getOptionValueId(
              productOptions[0]?.name,
              variantData.option1,
            );
            const optionValue2 = getOptionValueId(
              productOptions[1]?.name,
              variantData.option2,
            );
            const optionValue3 = getOptionValueId(
              productOptions[2]?.name,
              variantData.option3,
            );

            // Always create new variant as they are regenerated
            let variant = await this.productVariantRepository.create({
              productId,
              ...variantData,
              optionValue1,
              optionValue2,
              optionValue3,
            });
            logger.info("Variant created in update", {
              variantId: variant.id,
              productId,
            });
            result.variants.push(variant);
          } catch (variantError) {
            logger.error(
              "Error handling variant in comprehensive product update:",
              variantError,
            );
            result.errors.push(
              `Variant operation failed: ${variantError.message}`,
            );
          }
        }
      }

      // Step 7: Handle image updates
      if (images && images.length > 0) {
        // Always clear existing images first during full update
        try {
          await this.productRepository.deleteAllProductImages(productId);
          logger.info("Existing images cleared for update", { productId });
        } catch (imageDeleteError) {
          logger.error("Error clearing existing images:", imageDeleteError);
          result.errors.push(
            `Failed to clear existing images: ${imageDeleteError.message}`,
          );
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
              },
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
              imageError,
            );
            result.errors.push(`Image update failed: ${imageError.message}`);
          }
        }
      }

      // Step 8: Get final updated product with all details
      const updatedProduct = await this.productRepository.getProductWithDetails(
        productId,
        {
          includeImages: true,
          includeVariantImages: true,
          includeBrandDetails: true,
          includeRetailerDetails: true,
        },
      );

      result.product = updatedProduct;

      // Log the comprehensive operation completion
      logger.info("Comprehensive product update completed successfully", {
        productId,
        imagesUpdated: result.images.length,
        brandsAssociated: result.brands.length,
        hasWarehouse: !!result.warehouse,
        variantsUpdated: result.variants.length,
        errorCount: result.errors.length,
      });

      // Step 8: Handle school association
      if (schoolData) {
        try {
          const { schoolId, grade, mandatory } = schoolData;

          if (schoolId) {
            // we will overwrite or create since product can only have 1 active valid school combo in Retailer flow right now
            // or just use associateProduct which upserts
            await this.schoolRepository.associateProduct(productId, schoolId, {
              grade,
              mandatory,
            });

            result.school = { schoolId, grade, mandatory };
            logger.info(
              "School association updated in comprehensive operation",
              {
                productId,
                schoolId,
              },
            );
          }
        } catch (schoolError) {
          logger.error(
            "Error handling school in comprehensive product update:",
            schoolError,
          );
          result.errors.push(`School operation failed: ${schoolError.message}`);
        }
      }

      // Step 9: Handle Payment Methods updates
      if (data.paymentMethods && Array.isArray(data.paymentMethods)) {
        try {
          await this.productPaymentMethodRepository.setPaymentMethods(productId, data.paymentMethods);
          logger.info("Payment methods updated in comprehensive operation", { productId });
        } catch (pmError) {
          logger.error("Error handling payment methods in comprehensive product update:", pmError);
          result.errors.push(`Payment methods operation failed: ${pmError.message}`);
        }
      }

      // If there were any non-critical errors, include them in the response
      if (result.errors.length > 0) {
        logger.warn("Comprehensive product update had some errors", {
          productId,
          errors: result.errors,
        });
      }

      // Format response exactly like createComprehensiveProduct
      const finalProduct = await this.productRepository.findById(productId);

      // Inject standard response format to mimic create_comprehensive_product RPC result
      return {
        product: finalProduct,
        metadata: {
          warnings: result.errors,
        },
      };
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
   * Activate product
   */
  async activateProduct(productId, deliveryCharge) {
    try {
      const existingProduct = await this.productRepository.findById(productId);
      if (!existingProduct) {
        throw new AppError("Product not found", 404);
      }

      return await this.productRepository.activate(productId, deliveryCharge);
    } catch (error) {
      logger.error("Error activating product:", error);
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
          400,
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
          0,
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
        productId,
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
      const attribute =
        await this.productOptionRepository.findAttributeById(attributeId);
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
      const attribute =
        await this.productOptionRepository.findAttributeById(attributeId);
      if (!attribute) {
        throw new AppError("Product option attribute not found", 404);
      }

      return await this.productOptionRepository.updateAttribute(
        attributeId,
        updateData,
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

      return await this.productOptionRepository.updateValue(
        valueId,
        updateData,
      );
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
      const attribute =
        await this.productOptionRepository.findAttributeById(attributeId);
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

      return await this.productVariantRepository.findByProductId(productId);
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
            404,
          );
        }
      }

      // Get images using ProductImageRepository
      const images = await ProductImageRepository.getProductImages(
        productId,
        variantId,
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
      const existingVariant =
        await this.productVariantRepository.findById(variantId);
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
      const existingVariant =
        await this.productVariantRepository.findById(variantId);
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
      const existingVariant =
        await this.productVariantRepository.findById(variantId);
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
          400,
        );
      }

      return await this.productVariantRepository.updateStock(
        variantId,
        quantity,
        operation,
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
          400,
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
            operation,
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
        imagesData,
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
        updateData,
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
        variantId,
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
        variantImagesData,
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
        brandId,
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

  // ============ VARIANT COMMISSION METHODS ============

  /**
   * Get active commissions for all variants of a product
   */
  async getProductCommissions(productId) {
    try {
      const product = await this.productRepository.findById(productId);
      if (!product) {
        throw new AppError("Product not found", 404);
      }
      return await this.variantCommissionRepository.getCommissionsByProduct(productId);
    } catch (error) {
      logger.error("Error getting product commissions:", error);
      throw error;
    }
  }

  /**
   * Bulk update variant commissions
   */
  async bulkSetCommissions(commissions) {
    try {
      return await this.variantCommissionRepository.bulkSetCommissions(commissions);
    } catch (error) {
      logger.error("Error in bulk setting commissions:", error);
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
        retailerData,
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
        options,
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
          analytics.imageStats.imagesByVariant,
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
