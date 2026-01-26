import express from "express";
import { imageController } from "../controllers/imageController.js";
import { upload } from "../middleware/upload.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// All image routes should require authentication
router.use(authenticateToken);

/**
 * Upload image
 * POST /api/v1/images/upload
 */
router.post("/upload", upload.single("image"), imageController.uploadImage);

/**
 * Delete image
 * DELETE /api/v1/images/delete
 */
router.delete("/delete", imageController.deleteImage);

/**
 * Replace image
 * PUT /api/v1/images/replace
 */
router.put("/replace", upload.single("image"), imageController.replaceImage);

export default router;
