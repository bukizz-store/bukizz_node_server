import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import BrandRepository from "../repositories/brandRepository.js";

/**
 * Brand Controller
 * Handles HTTP requests for brand management operations
 */
export class BrandController {
    constructor() {
        this.brandRepository = BrandRepository;
    }

    /**
     * Create a new brand
     * POST /api/v1/brands
     */
    createBrand = asyncHandler(async (req, res) => {
        const brand = await this.brandRepository.create(req.body);

        logger.info("Brand created", { brandId: brand.id, name: brand.name });

        res.status(201).json({
            success: true,
            data: { brand },
            message: "Brand created successfully",
        });
    });

    /**
     * Get brand by ID
     * GET /api/v1/brands/:id
     */
    getBrand = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const brand = await this.brandRepository.findById(id);

        if (!brand) {
            return res.status(404).json({
                success: false,
                message: "Brand not found",
            });
        }

        res.json({
            success: true,
            data: { brand },
            message: "Brand retrieved successfully",
        });
    });

    /**
     * Search brands
     * GET /api/v1/brands
     */
    searchBrands = asyncHandler(async (req, res) => {
        const result = await this.brandRepository.search(req.query);

        res.json({
            success: true,
            data: result,
            message: "Brands retrieved successfully",
        });
    });

    /**
     * Update brand
     * PUT /api/v1/brands/:id
     */
    updateBrand = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const brand = await this.brandRepository.update(id, req.body);

        if (!brand) {
            return res.status(404).json({
                success: false,
                message: "Brand not found",
            });
        }

        logger.info("Brand updated", { brandId: id });

        res.json({
            success: true,
            data: { brand },
            message: "Brand updated successfully",
        });
    });

    /**
     * Delete brand
     * DELETE /api/v1/brands/:id
     */
    deleteBrand = asyncHandler(async (req, res) => {
        const { id } = req.params;

        // Check if brand exists first
        const existingBrand = await this.brandRepository.findById(id);
        if (!existingBrand) {
            return res.status(404).json({
                success: false,
                message: "Brand not found",
            });
        }

        await this.brandRepository.delete(id);

        logger.info("Brand deleted", { brandId: id });

        res.json({
            success: true,
            data: { deleted: true },
            message: "Brand deleted successfully",
        });
    });
}
