import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import categoryService from "../services/categoryService.js";

/**
 * Category Controller
 * Handles HTTP requests for category management
 */
export class CategoryController {
    constructor(service) {
        this.categoryService = service || categoryService;
    }

    /**
     * Create a new category
     * POST /api/categories
     */
    createCategory = asyncHandler(async (req, res) => {
        const category = await this.categoryService.createCategory(req.body);

        logger.info("Category created", { categoryId: category.id });

        res.status(201).json({
            success: true,
            data: { category },
            message: "Category created successfully",
        });
    });

    /**
     * Get category by ID
     * GET /api/categories/:id
     */
    getCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const category = await this.categoryService.getCategory(id);

        res.json({
            success: true,
            data: { category },
            message: "Category retrieved successfully",
        });
    });

    /**
     * Update category
     * PUT /api/categories/:id
     */
    updateCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const category = await this.categoryService.updateCategory(id, req.body);

        logger.info("Category updated", { categoryId: id });

        res.json({
            success: true,
            data: { category },
            message: "Category updated successfully",
        });
    });

    /**
     * Delete category
     * DELETE /api/categories/:id
     */
    deleteCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const success = await this.categoryService.deleteCategory(id);

        logger.info("Category deleted", { categoryId: id });

        res.json({
            success: true,
            data: { deleted: success },
            message: "Category deleted successfully",
        });
    });

    /**
     * Search/List categories
     * GET /api/categories
     */
    searchCategories = asyncHandler(async (req, res) => {
        const result = await this.categoryService.searchCategories(req.query);

        res.json({
            success: true,
            data: result,
            message: "Categories retrieved successfully",
        });
    });
}

export default new CategoryController();
