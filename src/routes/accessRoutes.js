import express from "express";
import {
  authenticateToken,
  requirePermissions,
} from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validator.js";
import {
  paramSchemas,
  accessControlSchemas,
} from "../models/schemas.js";

/**
 * Access Control Routes Factory
 * Endpoints for managing roles, permissions, user role assignments, and scopes.
 *
 * @param {Object} dependencies - DI container
 * @returns {Router} Express router
 */
export default function accessRoutes(dependencies = {}) {
  const router = express.Router();
  const { accessController, accessService } = dependencies;

  if (!accessController) {
    console.error("AccessController not found in dependencies");
    return router;
  }

  // All access control routes require authentication
  router.use(authenticateToken);

  // ─── Platform Roles ────────────────────────────────────────────────────────
  router.get(
    "/roles",
    requirePermissions(accessService, "users:read"),
    accessController.listRoles
  );

  router.post(
    "/roles",
    requirePermissions(accessService, "users:manage"),
    validate(accessControlSchemas.createRole),
    accessController.createRole
  );

  router.get(
    "/roles/:id",
    requirePermissions(accessService, "users:read"),
    validate(paramSchemas.id, "params"),
    accessController.getRole
  );

  router.put(
    "/roles/:id",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.id, "params"),
    validate(accessControlSchemas.updateRole),
    accessController.updateRole
  );

  router.delete(
    "/roles/:id",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.id, "params"),
    accessController.deleteRole
  );

  // ─── Role Permissions ──────────────────────────────────────────────────────
  router.get(
    "/roles/:id/permissions",
    requirePermissions(accessService, "users:read"),
    validate(paramSchemas.id, "params"),
    accessController.getRolePermissions
  );

  router.put(
    "/roles/:id/permissions",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.id, "params"),
    validate(accessControlSchemas.setRolePermissions),
    accessController.updateRolePermissions
  );

  // ─── Permissions Catalog ───────────────────────────────────────────────────
  router.get(
    "/permissions",
    requirePermissions(accessService, "users:read"),
    accessController.listPermissions
  );

  // ─── User Role Assignments & Admin Users ───────────────────────────────────
  router.get(
    "/users",
    requirePermissions(accessService, "users:read"),
    accessController.listAdminUsers
  );

  router.get(
    "/users/:userId/roles",
    requirePermissions(accessService, "users:read"),
    validate(paramSchemas.userId, "params"),
    accessController.getUserRoles
  );

  router.post(
    "/users/:userId/roles",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.userId, "params"),
    validate(accessControlSchemas.assignUserRole),
    accessController.assignUserRole
  );

  router.put(
    "/users/:userId/roles",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.userId, "params"),
    validate(accessControlSchemas.setUserRoles),
    accessController.setUserRoles
  );

  router.delete(
    "/users/:userId/roles/:roleId",
    requirePermissions(accessService, "users:manage"),
    accessController.removeUserRole
  );

  // ─── Administrative Scopes (ABAC) ──────────────────────────────────────────
  router.get(
    "/users/:userId/scopes",
    requirePermissions(accessService, "users:read"),
    validate(paramSchemas.userId, "params"),
    accessController.getUserScopes
  );

  router.post(
    "/users/:userId/scopes",
    requirePermissions(accessService, "users:manage"),
    validate(paramSchemas.userId, "params"),
    validate(accessControlSchemas.assignAdminScope),
    accessController.assignScope
  );

  router.delete(
    "/users/:userId/scopes/:scopeId",
    requirePermissions(accessService, "users:manage"),
    accessController.removeScope
  );

  // ─── Cache Management ──────────────────────────────────────────────────────
  router.post(
    "/cache/refresh",
    requirePermissions(accessService, "users:manage"),
    accessController.refreshCache
  );

  return router;
}
