import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Product Controller
 * Handles HTTP requests for product management operations with enhanced schema support
 */
export class ProductController {
  constructor(productService) {
    this.productService = productService;
  }

  /**
   * Create a new product
   * POST /api/products
   */
  createProduct = asyncHandler(async (req, res) => {
    const product = await this.productService.createProduct(req.body);

    logger.info("Product created", { productId: product.id });

    res.status(201).json({
      success: true,
      data: { product },
      message: "Product created successfully",
    });
  });

  /**
   * Create a comprehensive product with all related data atomically
   * POST /api/products/comprehensive
   */
  createComprehensiveProduct = asyncHandler(async (req, res) => {
    const {
      productData,
      images = [],
      brandData = null,
      retailerData = null,
      variants = [],
      categories = [],
    } = req.body;

    // Validate required data
    if (!productData) {
      return res.status(400).json({
        success: false,
        message: "Product data is required",
      });
    }

    const result = await this.productService.createComprehensiveProduct({
      productData,
      images,
      brandData,
      retailerData,
      variants,
      categories,
    });

    logger.info("Comprehensive product created", {
      productId: result.product.id,
      imagesCount: result.images?.length || 0,
      brandsCount: result.brands?.length || 0,
      hasRetailer: !!result.retailer,
      variantsCount: result.variants?.length || 0,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: "Product created successfully with all related data",
    });
  });

  /**
   * Get product by ID
   * GET /api/products/:id
   */
  getProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await this.productService.getProduct(id);

    res.json({
      success: true,
      data: { product },
      message: "Product retrieved successfully",
    });
  });

  /**
   * Search products with enhanced filtering
   * GET /api/products
   */
  searchProducts = asyncHandler(async (req, res) => {
    const result = await this.productService.searchProducts(req.query);

    res.json({
      success: true,
      data: result,
      message: "Products retrieved successfully",
    });
  });

  /**
   * Update product
   * PUT /api/products/:id
   */
  updateProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await this.productService.updateProduct(id, req.body);

    logger.info("Product updated", { productId: id });

    res.json({
      success: true,
      data: { product },
      message: "Product updated successfully",
    });
  });

  /**
   * Update comprehensive product with all related data
   * PUT /api/products/:id/comprehensive
   */
  updateComprehensiveProduct = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const {
      productData,
      images = [],
      brandData = null,
      retailerData = null,
      variants = [],
      categories = [],
      replaceVariants = false,
      replaceImages = false,
    } = req.body;

    // Validate required data
    if (
      !productData &&
      !images.length &&
      !brandData &&
      !retailerData &&
      !variants.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one update field is required (productData, images, brandData, retailerData, or variants)",
      });
    }

    const result = await this.productService.updateComprehensiveProduct(
      productId,
      {
        productData,
        images,
        brandData,
        retailerData,
        variants,
        categories,
        replaceVariants,
        replaceImages,
      }
    );

    logger.info("Comprehensive product updated", {
      productId,
      imagesUpdated: result.images?.length || 0,
      brandsUpdated: result.brands?.length || 0,
      hasRetailer: !!result.retailer,
      variantsUpdated: result.variants?.length || 0,
      errorCount: result.errors?.length || 0,
    });

    res.json({
      success: true,
      data: result,
      message: "Product updated successfully with all related data",
    });
  });

  /**
   * Delete product (soft delete)
   * DELETE /api/products/:id
   */
  deleteProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const success = await this.productService.deleteProduct(id);

    logger.info("Product deleted", { productId: id });

    res.json({
      success: true,
      data: { deleted: success },
      message: "Product deleted successfully",
    });
  });

  /**
   * Get products for a school
   * GET /api/products/school/:schoolId
   */
  getSchoolProducts = asyncHandler(async (req, res) => {
    const { schoolId } = req.params;
    const products = await this.productService.getSchoolProducts(
      schoolId,
      req.query
    );

    res.json({
      success: true,
      data: { products },
      message: "School products retrieved successfully",
    });
  });

  /**
   * Get featured products
   * GET /api/products/featured
   */
  getFeaturedProducts = asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    const products = await this.productService.getFeaturedProducts(
      parseInt(limit)
    );

    res.json({
      success: true,
      data: { products },
      message: "Featured products retrieved successfully",
    });
  });

  /**
   * Get products by category
   * GET /api/products/category/:categorySlug
   */
  getProductsByCategory = asyncHandler(async (req, res) => {
    const { categorySlug } = req.params;
    const result = await this.productService.getProductsByCategory(
      categorySlug,
      req.query
    );

    res.json({
      success: true,
      data: result,
      message: "Category products retrieved successfully",
    });
  });

  /**
   * Get products by brand
   * GET /api/products/brand/:brandId
   */
  getProductsByBrand = asyncHandler(async (req, res) => {
    const { brandId } = req.params;
    const result = await this.productService.getProductsByBrand(
      brandId,
      req.query
    );

    res.json({
      success: true,
      data: result,
      message: "Brand products retrieved successfully",
    });
  });

  /**
   * Get products by type
   * GET /api/products/type/:productType
   */
  getProductsByType = asyncHandler(async (req, res) => {
    const { productType } = req.params;
    const result = await this.productService.getProductsByType(
      productType,
      req.query
    );

    res.json({
      success: true,
      data: result,
      message: "Products by type retrieved successfully",
    });
  });

  /**
   * Check product availability
   * GET /api/products/:id/availability
   */
  checkAvailability = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { variantId, quantity = 1 } = req.query;

    const result = await this.productService.checkAvailability(
      id,
      variantId,
      parseInt(quantity)
    );

    res.json({
      success: true,
      data: result,
      message: "Availability checked successfully",
    });
  });

  /**
   * Get product options structure
   * GET /api/products/:id/options
   */
  getProductOptions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const options = await this.productService.getProductOptions(id);

    res.json({
      success: true,
      data: { options },
      message: "Product options retrieved successfully",
    });
  });

  /**
   * Add product option attribute
   * POST /api/products/:id/options
   */
  addProductOption = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const option = await this.productService.addProductOption(id, req.body);

    logger.info("Product option added", { productId: id, optionId: option.id });

    res.status(201).json({
      success: true,
      data: { option },
      message: "Product option added successfully",
    });
  });

  /**
   * Add product option value
   * POST /api/products/options/:attributeId/values
   */
  addProductOptionValue = asyncHandler(async (req, res) => {
    const { attributeId } = req.params;
    const value = await this.productService.addProductOptionValue(
      attributeId,
      req.body
    );

    logger.info("Product option value added", {
      attributeId,
      valueId: value.id,
    });

    res.status(201).json({
      success: true,
      data: { value },
      message: "Product option value added successfully",
    });
  });

  /**
   * Update product option attribute
   * PUT /api/products/options/:attributeId
   */
  updateProductOption = asyncHandler(async (req, res) => {
    const { attributeId } = req.params;
    const option = await this.productService.updateProductOption(
      attributeId,
      req.body
    );

    logger.info("Product option updated", { attributeId });

    res.json({
      success: true,
      data: { option },
      message: "Product option updated successfully",
    });
  });

  /**
   * Update product option value
   * PUT /api/products/options/values/:valueId
   */
  updateProductOptionValue = asyncHandler(async (req, res) => {
    const { valueId } = req.params;
    const value = await this.productService.updateProductOptionValue(
      valueId,
      req.body
    );

    logger.info("Product option value updated", { valueId });

    res.json({
      success: true,
      data: { value },
      message: "Product option value updated successfully",
    });
  });

  /**
   * Delete product option attribute
   * DELETE /api/products/options/:attributeId
   */
  deleteProductOption = asyncHandler(async (req, res) => {
    const { attributeId } = req.params;
    const success = await this.productService.deleteProductOption(attributeId);

    logger.info("Product option deleted", { attributeId });

    res.json({
      success: true,
      data: { deleted: success },
      message: "Product option deleted successfully",
    });
  });

  /**
   * Delete product option value
   * DELETE /api/products/options/values/:valueId
   */
  deleteProductOptionValue = asyncHandler(async (req, res) => {
    const { valueId } = req.params;
    const success = await this.productService.deleteProductOptionValue(valueId);

    logger.info("Product option value deleted", { valueId });

    res.json({
      success: true,
      data: { deleted: success },
      message: "Product option value deleted successfully",
    });
  });

  /**
   * Get product statistics
   * GET /api/products/stats
   */
  getProductStats = asyncHandler(async (req, res) => {
    const stats = await this.productService.getProductStats(req.query);

    res.json({
      success: true,
      data: stats,
      message: "Product statistics retrieved successfully",
    });
  });

  /**
   * Bulk update products
   * PUT /api/products/bulk-update
   */
  bulkUpdateProducts = asyncHandler(async (req, res) => {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const result = await this.productService.bulkUpdateProducts(updates);

    logger.info("Bulk product update completed", {
      total: result.summary.total,
      successful: result.summary.successful,
      failed: result.summary.failed,
    });

    res.json({
      success: true,
      data: result,
      message: "Bulk update completed",
    });
  });

  // ============ PRODUCT VARIANT METHODS ============

  /**
   * Create product variant
   * POST /api/products/:id/variants
   */
  createVariant = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const variant = await this.productService.createVariant(
      productId,
      req.body
    );

    logger.info("Product variant created", {
      productId,
      variantId: variant.id,
    });

    res.status(201).json({
      success: true,
      data: { variant },
      message: "Product variant created successfully",
    });
  });

  /**
   * Get variant by ID
   * GET /api/products/variants/:variantId
   */
  getVariant = asyncHandler(async (req, res) => {
    const { variantId } = req.params;
    const variant = await this.productService.getVariant(variantId);

    res.json({
      success: true,
      data: { variant },
      message: "Product variant retrieved successfully",
    });
  });

  /**
   * Get all variants for a product
   * GET /api/products/:id/variants
   */
  getProductVariants = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const variants = await this.productService.getProductVariants(productId);

    res.json({
      success: true,
      data: { variants },
      message: "Product variants retrieved successfully",
    });
  });

  /**
   * Get images for a product (includes variant-specific images)
   * GET /api/products/:id/images
   */
  getProductImages = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const { variantId } = req.query;

    const images = await this.productService.getProductImages(
      productId,
      variantId
    );

    res.json({
      success: true,
      data: { images },
      message: "Product images retrieved successfully",
    });
  });

  /**
   * Update variant
   * PUT /api/products/variants/:variantId
   */
  updateVariant = asyncHandler(async (req, res) => {
    const { variantId } = req.params;
    const variant = await this.productService.updateVariant(
      variantId,
      req.body
    );

    logger.info("Product variant updated", { variantId });

    res.json({
      success: true,
      data: { variant },
      message: "Product variant updated successfully",
    });
  });

  /**
   * Delete variant
   * DELETE /api/products/variants/:variantId
   */
  deleteVariant = asyncHandler(async (req, res) => {
    const { variantId } = req.params;
    const success = await this.productService.deleteVariant(variantId);

    logger.info("Product variant deleted", { variantId });

    res.json({
      success: true,
      data: { deleted: success },
      message: "Product variant deleted successfully",
    });
  });

  /**
   * Update variant stock
   * PATCH /api/products/variants/:variantId/stock
   */
  updateVariantStock = asyncHandler(async (req, res) => {
    const { variantId } = req.params;
    const { quantity, operation = "set" } = req.body;

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({
        success: false,
        message: "Quantity is required",
      });
    }

    const variant = await this.productService.updateVariantStock(
      variantId,
      quantity,
      operation
    );

    logger.info("Variant stock updated", {
      variantId,
      quantity,
      operation,
    });

    res.json({
      success: true,
      data: { variant },
      message: "Variant stock updated successfully",
    });
  });

  /**
   * Search variants
   * GET /api/products/variants/search
   */
  searchVariants = asyncHandler(async (req, res) => {
    const result = await this.productService.searchVariants(req.query);

    res.json({
      success: true,
      data: result,
      message: "Variants search completed successfully",
    });
  });

  /**
   * Bulk update variant stocks
   * PUT /api/products/variants/bulk-stock-update
   */
  bulkUpdateVariantStocks = asyncHandler(async (req, res) => {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const result = await this.productService.bulkUpdateVariantStocks(updates);

    logger.info("Bulk variant stock update completed", {
      total: result.summary.total,
      successful: result.summary.successful,
      failed: result.summary.failed,
    });

    res.json({
      success: true,
      data: result,
      message: "Bulk variant stock update completed",
    });
  });

  // ============ PRODUCT IMAGE MANAGEMENT METHODS ============

  /**
   * Add product image (supports both file upload and URL)
   * POST /api/products/:id/images
   */
  addProductImage = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;

    // Handle multipart form data for file uploads
    const imageData = {
      variantId: req.body.variantId || null,
      url: req.body.url || null,
      file: req.file || null, // From multer middleware
      altText: req.body.altText,
      sortOrder: parseInt(req.body.sortOrder) || 0,
      isPrimary: req.body.isPrimary === "true",
      imageType: req.body.imageType || "product",
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
    };

    const image = await this.productService.addProductImage(
      productId,
      imageData
    );

    logger.info("Product image added", {
      productId,
      imageId: image.id,
      source: imageData.file ? "upload" : "url",
    });

    res.status(201).json({
      success: true,
      data: { image },
      message: "Product image added successfully",
    });
  });

  /**
   * Add multiple product images
   * POST /api/products/:id/images/bulk
   */
  addProductImages = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const { images } = req.body;

    if (!images || !Array.isArray(images)) {
      return res.status(400).json({
        success: false,
        message: "Images array is required",
      });
    }

    const results = await this.productService.addProductImages(
      productId,
      images
    );

    logger.info("Multiple product images added", {
      productId,
      count: results.length,
    });

    res.status(201).json({
      success: true,
      data: { images: results, count: results.length },
      message: "Product images added successfully",
    });
  });

  /**
   * Update product image
   * PUT /api/products/images/:imageId
   */
  updateProductImage = asyncHandler(async (req, res) => {
    const { imageId } = req.params;

    const updateData = {
      url: req.body.url || null,
      file: req.file || null, // From multer middleware
      altText: req.body.altText,
      sortOrder: req.body.sortOrder ? parseInt(req.body.sortOrder) : undefined,
      isPrimary:
        req.body.isPrimary !== undefined
          ? req.body.isPrimary === "true"
          : undefined,
      imageType: req.body.imageType,
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
    };

    const image = await this.productService.updateProductImage(
      imageId,
      updateData
    );

    logger.info("Product image updated", { imageId });

    res.json({
      success: true,
      data: { image },
      message: "Product image updated successfully",
    });
  });

  /**
   * Delete product image
   * DELETE /api/products/images/:imageId
   */
  deleteProductImage = asyncHandler(async (req, res) => {
    const { imageId } = req.params;

    const success = await this.productService.deleteProductImage(imageId);

    logger.info("Product image deleted", { imageId });

    res.json({
      success: true,
      data: { deleted: success },
      message: "Product image deleted successfully",
    });
  });

  /**
   * Set primary image for product/variant
   * PATCH /api/products/:id/images/:imageId/primary
   */
  setPrimaryImage = asyncHandler(async (req, res) => {
    const { id: productId, imageId } = req.params;
    const { variantId } = req.body;

    const success = await this.productService.setPrimaryImage(
      imageId,
      productId,
      variantId
    );

    logger.info("Primary image set", { productId, imageId, variantId });

    res.json({
      success: true,
      data: { updated: success },
      message: "Primary image set successfully",
    });
  });

  /**
   * Get variant images
   * GET /api/products/variants/:variantId/images
   */
  getVariantImages = asyncHandler(async (req, res) => {
    const { variantId } = req.params;

    const images = await this.productService.getVariantImages(variantId);

    res.json({
      success: true,
      data: { images },
      message: "Variant images retrieved successfully",
    });
  });

  /**
   * Bulk upload variant images
   * POST /api/products/:id/variants/images/bulk
   */
  bulkUploadVariantImages = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const { variantImagesData } = req.body;

    if (!variantImagesData || typeof variantImagesData !== "object") {
      return res.status(400).json({
        success: false,
        message: "Variant images data is required",
      });
    }

    const results = await this.productService.bulkUploadVariantImages(
      productId,
      variantImagesData
    );

    logger.info("Bulk variant images uploaded", {
      productId,
      variantCount: Object.keys(results).length,
    });

    res.status(201).json({
      success: true,
      data: { results },
      message: "Variant images uploaded successfully",
    });
  });

  // ============ BRAND MANAGEMENT METHODS ============

  /**
   * Add brand to product
   * POST /api/products/:id/brands
   */
  addProductBrand = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;

    const result = await this.productService.addProductBrand(
      productId,
      req.body
    );

    logger.info("Brand added to product", {
      productId,
      brandId: result.brandId,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: result.message,
    });
  });

  /**
   * Remove brand from product
   * DELETE /api/products/:id/brands/:brandId
   */
  removeProductBrand = asyncHandler(async (req, res) => {
    const { id: productId, brandId } = req.params;

    const success = await this.productService.removeProductBrand(
      productId,
      brandId
    );

    logger.info("Brand removed from product", { productId, brandId });

    res.json({
      success: true,
      data: { removed: success },
      message: "Brand removed from product successfully",
    });
  });

  /**
   * Get product brands
   * GET /api/products/:id/brands
   */
  getProductBrands = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;

    const brands = await this.productService.getProductBrands(productId);

    res.json({
      success: true,
      data: { brands },
      message: "Product brands retrieved successfully",
    });
  });

  // ============ RETAILER MANAGEMENT METHODS ============

  /**
   * Add retailer details to product
   * POST /api/products/:id/retailer
   */
  addRetailerDetails = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;

    const result = await this.productService.addRetailerDetails(
      productId,
      req.body
    );

    logger.info("Retailer details added to product", {
      productId,
      retailerId: result.retailerId,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: result.message,
    });
  });

  /**
   * Update retailer details for product
   * PUT /api/products/:id/retailer
   */
  updateRetailerDetails = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;

    const result = await this.productService.updateRetailerDetails(
      productId,
      req.body
    );

    logger.info("Retailer details updated for product", {
      productId,
      retailerId: result.retailerId,
    });

    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  });

  /**
   * Remove retailer from product
   * DELETE /api/products/:id/retailer
   */
  removeRetailerDetails = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;

    const result = await this.productService.removeRetailerDetails(productId);

    logger.info("Retailer removed from product", {
      productId,
    });

    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  });

  // ============ COMPREHENSIVE DATA METHODS ============

  /**
   * Get product with all details (images, brands, retailer)
   * GET /api/products/:id/complete
   */
  getProductWithDetails = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const {
      includeImages = true,
      includeVariantImages = true,
      includeBrandDetails = true,
      includeRetailerDetails = true,
    } = req.query;

    const options = {
      includeImages: includeImages === "true",
      includeVariantImages: includeVariantImages === "true",
      includeBrandDetails: includeBrandDetails === "true",
      includeRetailerDetails: includeRetailerDetails === "true",
    };

    const product = await this.productService.getProductWithDetails(
      productId,
      options
    );

    res.json({
      success: true,
      data: { product },
      message: "Complete product details retrieved successfully",
    });
  });

  /**
   * Get product analytics and insights
   * GET /api/products/:id/analytics
   */
  getProductAnalytics = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;

    const analytics = await this.productService.getProductAnalytics(productId);

    res.json({
      success: true,
      data: { analytics },
      message: "Product analytics retrieved successfully",
    });
  });
}
