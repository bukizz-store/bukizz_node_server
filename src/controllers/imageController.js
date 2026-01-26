import { imageService } from "../services/imageService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

export class ImageController {
    /**
     * Upload a new image
     * POST /api/v1/images/upload
     */
    uploadImage = asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file provided",
            });
        }

        const result = await imageService.uploadImage(req.file);

        logger.info("Image uploaded successfully", { path: result.path });

        res.status(201).json({
            success: true,
            data: result,
            message: "Image uploaded successfully",
        });
    });

    /**
     * Delete an image
     * DELETE /api/v1/images
     * Body: { url: "..." } or Query: ?url=...
     */
    deleteImage = asyncHandler(async (req, res) => {
        const url = req.body.url || req.query.url;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "Image URL is required"
            });
        }

        await imageService.deleteImage(url);

        logger.info("Image deleted successfully", { url });

        res.json({
            success: true,
            data: { deleted: true },
            message: "Image deleted successfully",
        });
    });

    /**
     * Replace an image
     * PUT /api/v1/images/replace
     * Body: { oldUrl: "..." }
     * File: image
     */
    replaceImage = asyncHandler(async (req, res) => {
        const { oldUrl } = req.body;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "New image file is required"
            });
        }

        if (!oldUrl) {
            // If no old URL, just treat as upload
            const result = await imageService.uploadImage(req.file);
            return res.status(201).json({
                success: true,
                data: result,
                message: "Image uploaded (no old URL provided for replacement)",
            });
        }

        const result = await imageService.replaceImage(oldUrl, req.file);

        logger.info("Image replaced successfully", { oldUrl, newPath: result.path });

        res.json({
            success: true,
            data: result,
            message: "Image replaced successfully",
        });
    });
}

export const imageController = new ImageController();
