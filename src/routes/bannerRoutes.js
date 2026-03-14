import express from "express";
import { BannerController } from "../controllers/bannerController.js";
import { authenticateToken, requireRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * Setup banner routes
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router
 */
export default function bannerRoutes(dependencies = {}) {
  const bannerController = dependencies.bannerController || new BannerController();

  // Public Routes
  router.get("/public", bannerController.getPublicBanners);

  // Admin Routes (Protected)
  router.use(authenticateToken);
  router.use(requireRoles("admin"));

  router.post("/", bannerController.createBanner);
  router.get("/", bannerController.getBanners);
  router.put("/:id", bannerController.updateBanner);
  router.delete("/:id", bannerController.deleteBanner);

  return router;
}
