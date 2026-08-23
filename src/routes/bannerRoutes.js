import express from "express";
import { BannerController } from "../controllers/bannerController.js";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";

/**
 * Setup banner routes
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router
 */
export default function bannerRoutes(dependencies = {}) {
  const router = express.Router();
  const bannerController =
    dependencies.bannerController || new BannerController();
  const { accessService } = dependencies;

  // Public Routes
  router.get("/public", bannerController.getPublicBanners);

  // Admin Routes (Protected via RBAC)
  router.get(
    "/",
    authenticateToken,
    requirePermissions(accessService, "banners:read"),
    bannerController.getBanners
  );

  router.post(
    "/",
    authenticateToken,
    requirePermissions(accessService, "banners:manage"),
    bannerController.createBanner
  );

  router.put(
    "/:id",
    authenticateToken,
    requirePermissions(accessService, "banners:manage"),
    bannerController.updateBanner
  );

  router.delete(
    "/:id",
    authenticateToken,
    requirePermissions(accessService, "banners:manage"),
    bannerController.deleteBanner
  );

  return router;
}
