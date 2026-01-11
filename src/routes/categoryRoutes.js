import express from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
    categorySchemas,
    paramSchemas
} from "../models/schemas.js";
import categoryController from "../controllers/categoryController.js";

/**
 * Category Routes
 * @returns {Router} Express router
 */
export default function categoryRoutes() {
    const router = express.Router();

    // Configure multer for file uploads (similar to schoolRoutes)
    const storage = multer.memoryStorage();
    const upload = multer({
        storage,
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB limit
        },
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith("image/")) {
                cb(null, true);
            } else {
                cb(new Error("Only image files are allowed"), false);
            }
        },
    });

    // Public Routes

    /**
     * Search/List categories
     * GET /api/v1/categories
     */
    router.get(
        "/",
        validate(categorySchemas.query, "query"),
        categoryController.searchCategories
    );

    /**
     * Get category by ID
     * GET /api/v1/categories/:id
     */
    router.get(
        "/:id",
        validate(paramSchemas.id, "params"),
        categoryController.getCategory
    );

    // Protected Routes (Create, Update, Delete)

    /**
     * Create category
     * POST /api/v1/categories
     */
    router.post(
        "/",
        authenticateToken,
        upload.single("image"),
        // Add authorize('admin') if you want to restrict to admins
        validate(categorySchemas.create),
        categoryController.createCategory
    );

    /**
     * Update category
     * PUT /api/v1/categories/:id
     */
    router.put(
        "/:id",
        authenticateToken,
        upload.single("image"),
        // Add authorize('admin') if you want to restrict to admins
        validate(paramSchemas.id, "params"),
        validate(categorySchemas.update),
        categoryController.updateCategory
    );

    /**
     * Delete category
     * DELETE /api/v1/categories/:id
     */
    router.delete(
        "/:id",
        authenticateToken,
        // Add authorize('admin') if you want to restrict to admins
        validate(paramSchemas.id, "params"),
        categoryController.deleteCategory
    );

    return router;
}
