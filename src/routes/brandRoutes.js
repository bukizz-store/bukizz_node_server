import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import { brandSchemas, paramSchemas } from "../models/schemas.js";
import { BrandController } from "../controllers/brandController.js";

/**
 * Brand Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with brand routes
 */
export default function brandRoutes(dependencies = {}) {
    const router = express.Router();

    // Initialize controller
    const brandController = new BrandController();

    // Public routes

    /**
     * Search/Get all brands
     * GET /api/v1/brands
     */
    router.get(
        "/",
        validate(brandSchemas.query, "query"),
        brandController.searchBrands
    );

    /**
     * Get brand by ID
     * GET /api/v1/brands/:id
     */
    router.get(
        "/:id",
        validate(paramSchemas.id, "params"),
        brandController.getBrand
    );

    // Protected routes (require authentication)

    /**
     * Create a new brand
     * POST /api/v1/brands
     */
    router.post(
        "/",
        authenticateToken,
        validate(brandSchemas.create),
        brandController.createBrand
    );

    /**
     * Update brand
     * PUT /api/v1/brands/:id
     */
    router.put(
        "/:id",
        authenticateToken,
        validate(paramSchemas.id, "params"),
        validate(brandSchemas.update),
        brandController.updateBrand
    );

    /**
     * Delete brand
     * DELETE /api/v1/brands/:id
     */
    router.delete(
        "/:id",
        authenticateToken,
        validate(paramSchemas.id, "params"),
        brandController.deleteBrand
    );

    return router;
}
