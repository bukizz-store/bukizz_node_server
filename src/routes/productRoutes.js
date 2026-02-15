import express from "express";

import {
  authenticateToken,
  requireRoles,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
  productSchemas,
  productOptionSchemas,
  productVariantSchemas,
  paramSchemas,
  headerSchemas,
} from "../models/schemas.js";

import { upload } from "../middleware/upload.js";

/**
 * Product Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with product routes
 */
export default function productRoutes(dependencies = {}) {
  const router = express.Router();

  // Get the product controller from dependencies
  const { productController } = dependencies;

  // If no productController is provided, return empty router
  if (!productController) {
    console.error("ProductController not found in dependencies");
    return router;
  }

  // Public product routes (no authentication required)

  /**
   * Search/Get all products
   * GET /api/v1/products
   */
  router.get(
    "/",
    validate(productSchemas.query, "query"),
    productController.searchProducts,
  );

  /**
   * Get products for warehouse (Retailer Dashboard)
   * GET /api/v1/products/warehouse
   */
  router.get(
    "/warehouse",
    authenticateToken,
    // requireRoles("retailer"),
    validate(headerSchemas.warehouseHeaders, "headers"),
    validate(productSchemas.warehouseProductQuery, "query"),
    productController.getProductsByWarehouse,
  );

  /**
   * Get low-stock products for a warehouse (Retailer Dashboard)
   * GET /api/v1/products/warehouse/low-stock
   * Header: x-warehouse-id
   * Query: threshold (default 10), outOfStockOnly ("true"/"false")
   */
  router.get(
    "/warehouse/low-stock",
    authenticateToken,
    validate(headerSchemas.warehouseHeaders, "headers"),
    productController.getLowStockProducts,
  );

  /**
   * Search products by retailer name
   * GET /api/v1/products/retailer-search
   */
  router.get(
    "/retailer-search",
    validate(productSchemas.query, "query"),
    productController.getProductsByRetailer,
  );

  /**
   * Get featured products
   * GET /api/v1/products/featured
   */
  router.get("/featured", productController.getFeaturedProducts);

  /**
   * Get product statistics
   * GET /api/v1/products/stats
   */
  router.get("/stats", productController.getProductStats);

  /**
   * Search variants (public endpoint)
   * GET /api/v1/products/variants/search
   */
  router.get(
    "/variants/search",
    validate(productVariantSchemas.update, "query"), // Using update schema as it's optional fields
    productController.searchVariants,
  );

  /**
   * Get variant by ID (public endpoint)
   * GET /api/v1/products/variants/:variantId
   */
  router.get(
    "/variants/:variantId",
    validate(paramSchemas.variantId, "params"),
    productController.getVariant,
  );

  /**
   * Get products by category
   * GET /api/v1/products/category/:categorySlug
   */
  router.get(
    "/category/:categorySlug",
    validate(paramSchemas.categorySlug, "params"),
    validate(productSchemas.query, "query"),
    productController.getProductsByCategory,
  );

  /**
   * Get products by brand
   * GET /api/v1/products/brand/:brandId
   */
  router.get(
    "/brand/:brandId",
    validate(paramSchemas.brandId, "params"),
    validate(productSchemas.query, "query"),
    productController.getProductsByBrand,
  );

  /**
   * Get products by type
   * GET /api/v1/products/type/:productType
   */
  router.get(
    "/type/:productType",
    validate(paramSchemas.productType, "params"),
    validate(productSchemas.query, "query"),
    productController.getProductsByType,
  );

  /**
   * Get products for a school
   * GET /api/v1/products/school/:schoolId
   */
  router.get(
    "/school/:schoolId",
    validate(paramSchemas.schoolId, "params"),
    validate(productSchemas.query, "query"),
    productController.getSchoolProducts,
  );

  /**
   * Get product by ID
   * GET /api/v1/products/:id
   */
  router.get(
    "/:id",
    validate(paramSchemas.id, "params"),
    productController.getProduct,
  );

  /**
   * Get product with complete details (images, brands, retailer)
   * GET /api/v1/products/:id/complete
   */
  router.get(
    "/:id/complete",
    validate(paramSchemas.id, "params"),
    productController.getProductWithDetails,
  );

  /**
   * Get product analytics
   * GET /api/v1/products/:id/analytics
   */
  router.get(
    "/:id/analytics",
    validate(paramSchemas.id, "params"),
    productController.getProductAnalytics,
  );

  /**
   * Check product availability
   * GET /api/v1/products/:id/availability
   */
  router.get(
    "/:id/availability",
    validate(paramSchemas.id, "params"),
    productController.checkAvailability,
  );

  /**
   * Get product options structure
   * GET /api/v1/products/:id/options
   */
  router.get(
    "/:id/options",
    validate(paramSchemas.id, "params"),
    productController.getProductOptions,
  );

  /**
   * Get all variants for a product
   * GET /api/v1/products/:id/variants
   */
  router.get(
    "/:id/variants",
    validate(paramSchemas.id, "params"),
    productController.getProductVariants,
  );

  /**
   * Get images for a product (includes variant-specific images)
   * GET /api/v1/products/:id/images
   */
  router.get(
    "/:id/images",
    validate(paramSchemas.id, "params"),
    productController.getProductImages,
  );

  /**
   * Get variant images
   * GET /api/v1/products/variants/:variantId/images
   */
  router.get(
    "/variants/:variantId/images",
    validate(paramSchemas.variantId, "params"),
    productController.getVariantImages,
  );

  /**
   * Get product brands
   * GET /api/v1/products/:id/brands
   */
  router.get(
    "/:id/brands",
    validate(paramSchemas.id, "params"),
    productController.getProductBrands,
  );

  // Protected routes (require authentication)

  /**
   * Admin Search Products
   * GET /api/v1/products/admin/search
   */
  router.get(
    "/admin/search",
    authenticateToken,
    validate(productSchemas.adminQuery, "query"),
    productController.adminSearchProducts,
  );

  /**
   * Create a new product
   * POST /api/v1/products
   */
  router.post(
    "/",
    authenticateToken,
    validate(productSchemas.create),
    productController.createProduct,
  );

  /**
   * Create a comprehensive product with all related data atomically
   * POST /api/v1/products/comprehensive
   */
  router.post(
    "/comprehensive",
    authenticateToken,
    productController.createComprehensiveProduct,
  );

  /**
   * Update product
   * PUT /api/v1/products/:id
   */
  router.put(
    "/:id",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    validate(productSchemas.update),
    productController.updateProduct,
  );

  /**
   * Update comprehensive product with all related data atomically
   * PUT /api/v1/products/:id/comprehensive
   */
  router.put(
    "/:id/comprehensive",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.updateComprehensiveProduct,
  );

  /**
   * Delete product (soft delete)
   * DELETE /api/v1/products/:id
   */
  router.delete(
    "/:id",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.deleteProduct,
  );

  /**
   * Activate product
   * PATCH /api/v1/products/:id/activate
   */
  router.patch(
    "/:id/activate",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.activateProduct,
  );

  /**
   * Add product option attribute
   * POST /api/v1/products/:id/options
   */
  router.post(
    "/:id/options",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    validate(productOptionSchemas.createAttribute),
    productController.addProductOption,
  );

  /**
   * Add product option value
   * POST /api/v1/products/options/:attributeId/values
   */
  router.post(
    "/options/:attributeId/values",
    authenticateToken,
    validate(paramSchemas.attributeId, "params"),
    validate(productOptionSchemas.createValue),
    productController.addProductOptionValue,
  );

  /**
   * Update product option attribute
   * PUT /api/v1/products/options/:attributeId
   */
  router.put(
    "/options/:attributeId",
    authenticateToken,
    validate(paramSchemas.attributeId, "params"),
    validate(productOptionSchemas.updateAttribute),
    productController.updateProductOption,
  );

  /**
   * Update product option value
   * PUT /api/v1/products/options/values/:valueId
   */
  router.put(
    "/options/values/:valueId",
    authenticateToken,
    validate(paramSchemas.valueId, "params"),
    validate(productOptionSchemas.updateValue),
    productController.updateProductOptionValue,
  );

  /**
   * Delete product option attribute
   * DELETE /api/v1/products/options/:attributeId
   */
  router.delete(
    "/options/:attributeId",
    authenticateToken,
    validate(paramSchemas.attributeId, "params"),
    productController.deleteProductOption,
  );

  /**
   * Delete product option value
   * DELETE /api/v1/products/options/values/:valueId
   */
  router.delete(
    "/options/values/:valueId",
    authenticateToken,
    validate(paramSchemas.valueId, "params"),
    productController.deleteProductOptionValue,
  );

  /**
   * Bulk update products
   * PUT /api/v1/products/bulk-update
   */
  router.put(
    "/bulk-update",
    authenticateToken,
    productController.bulkUpdateProducts,
  );

  // ============ PRODUCT VARIANT ROUTES (Protected) ============

  /**
   * Create product variant
   * POST /api/v1/products/:id/variants
   */
  router.post(
    "/:id/variants",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    validate(productVariantSchemas.create),
    productController.createVariant,
  );

  /**
   * Bulk update variant stocks
   * PUT /api/v1/products/variants/bulk-stock-update
   * NOTE: Must be defined BEFORE /variants/:variantId to avoid param capture
   */
  router.put(
    "/variants/bulk-stock-update",
    authenticateToken,
    productController.bulkUpdateVariantStocks,
  );

  /**
   * Update variant
   * PUT /api/v1/products/variants/:variantId
   */
  router.put(
    "/variants/:variantId",
    authenticateToken,
    validate(paramSchemas.variantId, "params"),
    validate(productVariantSchemas.update),
    productController.updateVariant,
  );

  /**
   * Delete variant
   * DELETE /api/v1/products/variants/:variantId
   */
  router.delete(
    "/variants/:variantId",
    authenticateToken,
    validate(paramSchemas.variantId, "params"),
    productController.deleteVariant,
  );

  /**
   * Update variant stock
   * PATCH /api/v1/products/variants/:variantId/stock
   */
  router.patch(
    "/variants/:variantId/stock",
    authenticateToken,
    validate(paramSchemas.variantId, "params"),
    productController.updateVariantStock,
  );

  // ============ PRODUCT IMAGE MANAGEMENT ROUTES (Protected) ============

  /**
   * Add product image (supports both file upload and URL)
   * POST /api/v1/products/:id/images
   */
  router.post(
    "/:id/images",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    upload.single("image"), // Handle file upload
    productController.addProductImage,
  );

  /**
   * Add multiple product images
   * POST /api/v1/products/:id/images/bulk
   */
  router.post(
    "/:id/images/bulk",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.addProductImages,
  );

  /**
   * Update product image
   * PUT /api/v1/products/images/:imageId
   */
  router.put(
    "/images/:imageId",
    authenticateToken,
    validate(paramSchemas.imageId, "params"),
    upload.single("image"), // Handle file upload
    productController.updateProductImage,
  );

  /**
   * Delete product image
   * DELETE /api/v1/products/images/:imageId
   */
  router.delete(
    "/images/:imageId",
    authenticateToken,
    validate(paramSchemas.imageId, "params"),
    productController.deleteProductImage,
  );

  /**
   * Set primary image for product/variant
   * PATCH /api/v1/products/:id/images/:imageId/primary
   */
  router.patch(
    "/:id/images/:imageId/primary",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    validate(paramSchemas.imageId, "params"),
    productController.setPrimaryImage,
  );

  /**
   * Bulk upload variant images
   * POST /api/v1/products/:id/variants/images/bulk
   */
  router.post(
    "/:id/variants/images/bulk",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.bulkUploadVariantImages,
  );

  // ============ BRAND MANAGEMENT ROUTES (Protected) ============

  /**
   * Add brand to product
   * POST /api/v1/products/:id/brands
   */
  router.post(
    "/:id/brands",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.addProductBrand,
  );

  /**
   * Remove brand from product
   * DELETE /api/v1/products/:id/brands/:brandId
   */
  router.delete(
    "/:id/brands/:brandId",
    authenticateToken,
    validate(paramSchemas.idAndBrandId, "params"),
    productController.removeProductBrand,
  );

  // ============ RETAILER MANAGEMENT ROUTES (Protected) ============

  /**
   * Add retailer details to product
   * POST /api/v1/products/:id/retailer
   */
  router.post(
    "/:id/retailer",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.addRetailerDetails,
  );

  /**
   * Update retailer details for product
   * PUT /api/v1/products/:id/retailer
   */
  router.put(
    "/:id/retailer",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.updateRetailerDetails,
  );

  /**
   * Remove retailer from product
   * DELETE /api/v1/products/:id/retailer
   */
  router.delete(
    "/:id/retailer",
    authenticateToken,
    validate(paramSchemas.id, "params"),
    productController.removeRetailerDetails,
  );

  // ============ COMPREHENSIVE DATA ROUTES (Protected) ============

  return router;
}
