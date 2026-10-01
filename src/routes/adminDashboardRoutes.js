import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { dashboardController } from "../controllers/dashboardController.js";

/**
 * Admin Dashboard Routes
 * Exposes executive analytics, KPI metrics, recent activity, and triage alerts
 * for administrative staff.
 *
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function adminDashboardRoutes(dependencies = {}) {
  const router = express.Router();

  // All dashboard routes require authentication
  router.use(authenticateToken);

  /**
   * @route GET /api/v1/admin/dashboard/overview
   * @desc Get aggregated platform overview (KPIs, charts, pending triage, recent orders)
   * @access Admin staff
   */
  router.get("/overview", dashboardController.getAdminDashboardOverview);

  return router;
}
