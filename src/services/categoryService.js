import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import CategoryRepository from "../repositories/categoryRepository.js";

/**
 * Category Service
 * Handles category management business logic
 */
export class CategoryService {
    constructor(categoryRepository) {
        this.categoryRepository = categoryRepository || CategoryRepository;
    }

    /**
     * Create a new category
     */
    async createCategory(categoryData, imageFile) {
        try {
            // Generate slug if not provided
            if (!categoryData.slug) {
                categoryData.slug = this.generateSlug(categoryData.name);
            }

            // Check if slug exists
            const existingCategory = await this.categoryRepository.findBySlug(categoryData.slug);
            if (existingCategory) {
                throw new AppError("Category with this slug already exists", 409);
            }

            // Check parent category if provided
            if (categoryData.parentId) {
                const parentCategory = await this.categoryRepository.findById(categoryData.parentId);
                if (!parentCategory) {
                    throw new AppError("Parent category not found", 404);
                }
            }

            // Upload image if provided
            if (imageFile) {
                const imageUrl = await this.categoryRepository.uploadImage(imageFile);
                categoryData.image = imageUrl;
            }

            return await this.categoryRepository.create(categoryData);
        } catch (error) {
            logger.error("Error creating category:", error);
            throw error;
        }
    }

    /**
     * Update category
     */
    async updateCategory(categoryId, updateData, imageFile) {
        try {
            const existingCategory = await this.categoryRepository.findById(categoryId);
            if (!existingCategory) {
                throw new AppError("Category not found", 404);
            }

            // If updating name but not slug, regenerate slug? 
            // Usually slug should stick, but let's regenerate only if explicitly requested or empty slug provided for update?
            // For now, let's keep slug stable unless explicitly changed.

            if (updateData.slug) {
                // Check uniqueness if slug is changing
                if (updateData.slug !== existingCategory.slug) {
                    const duplicate = await this.categoryRepository.findBySlug(updateData.slug);
                    if (duplicate && duplicate.id !== categoryId) {
                        throw new AppError("Category with this slug already exists", 409);
                    }
                }
            }

            // Check parent category if provided
            if (updateData.parentId) {
                if (updateData.parentId === categoryId) {
                    throw new AppError("Category cannot be its own parent", 400);
                }
                const parentCategory = await this.categoryRepository.findById(updateData.parentId);
                if (!parentCategory) {
                    throw new AppError("Parent category not found", 404);
                }
            }

            // Upload image if provided
            if (imageFile) {
                const imageUrl = await this.categoryRepository.uploadImage(imageFile);
                updateData.image = imageUrl;
            }

            return await this.categoryRepository.update(categoryId, updateData);
        } catch (error) {
            logger.error("Error updating category:", error);
            throw error;
        }
    }

    /**
     * Delete category
     */
    async deleteCategory(categoryId) {
        try {
            const existingCategory = await this.categoryRepository.findById(categoryId);
            if (!existingCategory) {
                throw new AppError("Category not found", 404);
            }

            // Look for children?
            // Ideally prevent deletion if children exist
            const children = await this.categoryRepository.search({ parentId: categoryId });
            if (children.categories.length > 0) {
                throw new AppError("Cannot delete category with sub-categories. Please move or delete them first.", 400);
            }

            return await this.categoryRepository.delete(categoryId);
        } catch (error) {
            logger.error("Error deleting category:", error);
            throw error;
        }
    }

    /**
     * Get category by ID
     */
    async getCategory(categoryId) {
        try {
            const category = await this.categoryRepository.findById(categoryId);
            if (!category) {
                throw new AppError("Category not found", 404);
            }
            return category;
        } catch (error) {
            logger.error("Error getting category:", error);
            throw error;
        }
    }

    /**
     * Helper to generate URL-friendly slug
     */
    generateSlug(name) {
        return name
            .toLowerCase()
            .replace(/[^\w\s-]/g, "") // Remove non-word chars
            .replace(/\s+/g, "-") // Replace spaces with dashes
            .replace(/-+/g, "-") // Collapse dashes
            .trim();
    }

    /**
   * Search categories
   */
    async searchCategories(filters) {
        try {
            return await this.categoryRepository.search(filters);
        } catch (error) {
            logger.error("Error searching categories:", error);
            throw error;
        }
    }
}

export default new CategoryService();
