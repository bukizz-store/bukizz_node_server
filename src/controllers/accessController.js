import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Access Control Controller
 * Handles administrative RBAC and ABAC operations: role management,
 * permission mapping, user role assignments, and scope boundaries.
 */
export class AccessController {
  constructor(accessService) {
    if (!accessService) {
      throw new Error("AccessController requires an accessService instance");
    }
    this.accessService = accessService;
  }

  /**
   * List all registered administrative roles
   * GET /api/v1/admin/access/roles
   */
  listRoles = asyncHandler(async (req, res) => {
    const roles = await this.accessService.getAllRoles();
    res.json({
      success: true,
      data: roles,
      message: "Roles retrieved successfully",
    });
  });

  /**
   * Get single role by ID
   * GET /api/v1/admin/access/roles/:id
   */
  getRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const role = await this.accessService.getRoleById(id);
    const permissions = await this.accessService.getRolePermissions(id);
    res.json({
      success: true,
      data: { ...role, permissions },
      message: "Role details retrieved successfully",
    });
  });

  /**
   * Create a new administrative role
   * POST /api/v1/admin/access/roles
   */
  createRole = asyncHandler(async (req, res) => {
    const { roleName, description, permissions } = req.body;
    const role = await this.accessService.createRole({
      roleName,
      description,
      permissions,
    });
    res.status(201).json({
      success: true,
      data: role,
      message: "Role created successfully",
    });
  });

  /**
   * Update an administrative role
   * PUT /api/v1/admin/access/roles/:id
   */
  updateRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { roleName, description, permissions } = req.body;
    const updated = await this.accessService.updateRole(id, {
      roleName,
      description,
      permissions,
    });
    res.json({
      success: true,
      data: updated,
      message: "Role updated successfully",
    });
  });

  /**
   * Delete an administrative role
   * DELETE /api/v1/admin/access/roles/:id
   */
  deleteRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await this.accessService.deleteRole(id);
    res.json({
      success: true,
      message: "Role deleted successfully",
    });
  });

  /**
   * List complete platform permissions catalog
   * GET /api/v1/admin/access/permissions
   */
  listPermissions = asyncHandler(async (req, res) => {
    const permissions = await this.accessService.getAllPermissions();
    res.json({
      success: true,
      data: permissions,
      message: "Permissions catalog retrieved successfully",
    });
  });

  /**
   * Get permissions for a specific role
   * GET /api/v1/admin/access/roles/:id/permissions
   */
  getRolePermissions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const permissions = await this.accessService.getRolePermissions(id);
    res.json({
      success: true,
      data: permissions,
      message: "Role permissions retrieved successfully",
    });
  });

  /**
   * Update permissions for a role
   * PUT /api/v1/admin/access/roles/:id/permissions
   */
  updateRolePermissions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { permissions } = req.body;
    const updatedIds = await this.accessService.setRolePermissions(id, permissions);
    res.json({
      success: true,
      data: { roleId: id, permissionIds: updatedIds },
      message: "Role permissions updated successfully",
    });
  });

  /**
   * Get user's assigned administrative roles
   * GET /api/v1/admin/access/users/:userId/roles
   */
  getUserRoles = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const roles = await this.accessService.getUserAdminRolesWithDetails(userId);
    res.json({
      success: true,
      data: roles,
      message: "User roles retrieved successfully",
    });
  });

  /**
   * Assign an administrative role to a user
   * POST /api/v1/admin/access/users/:userId/roles
   */
  assignUserRole = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { roleId } = req.body;
    const result = await this.accessService.assignUserAdminRole(userId, roleId);
    res.status(201).json({
      success: true,
      data: result,
      message: "Role assigned to user successfully",
    });
  });

  /**
   * Set (replace) all administrative roles for a user
   * PUT /api/v1/admin/access/users/:userId/roles
   */
  setUserRoles = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { roleIds } = req.body;
    const result = await this.accessService.setUserAdminRoles(userId, roleIds);
    res.json({
      success: true,
      data: { userId, roleIds: result },
      message: "User roles updated successfully",
    });
  });

  /**
   * Remove an administrative role from a user
   * DELETE /api/v1/admin/access/users/:userId/roles/:roleId
   */
  removeUserRole = asyncHandler(async (req, res) => {
    const { userId, roleId } = req.params;
    await this.accessService.removeUserAdminRole(userId, roleId);
    res.json({
      success: true,
      message: "Role removed from user successfully",
    });
  });

  /**
   * Get user's administrative scopes (ABAC)
   * GET /api/v1/admin/access/users/:userId/scopes
   */
  getUserScopes = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const scopes = await this.accessService.getAdminScopes(userId);
    res.json({
      success: true,
      data: scopes,
      message: "User scopes retrieved successfully",
    });
  });

  /**
   * Assign an administrative scope (ABAC) constraint to a user
   * POST /api/v1/admin/access/users/:userId/scopes
   */
  assignScope = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { entityType, entityId } = req.body;
    const result = await this.accessService.addAdminScope(
      userId,
      entityType,
      entityId || null
    );
    res.status(201).json({
      success: true,
      data: result,
      message: "Admin scope assigned successfully",
    });
  });

  /**
   * Remove an administrative scope from a user
   * DELETE /api/v1/admin/access/users/:userId/scopes/:scopeId
   */
  removeScope = asyncHandler(async (req, res) => {
    const { userId, scopeId } = req.params;
    await this.accessService.removeAdminScope(userId, scopeId);
    res.json({
      success: true,
      message: "Admin scope removed successfully",
    });
  });

  /**
   * Force refresh in-memory RBAC cache
   * POST /api/v1/admin/access/cache/refresh
   */
  refreshCache = asyncHandler(async (req, res) => {
    const stats = await this.accessService.refreshRoleCache();
    res.json({
      success: true,
      data: stats,
      message: "RBAC in-memory cache refreshed successfully",
    });
  });

  /**
   * List admin users with their assigned admin_roles and admin_scopes
   * GET /api/v1/admin/access/users
   */
  listAdminUsers = asyncHandler(async (req, res) => {
    const { page, limit, search, query, q, role } = req.query;
    const result = await this.accessService.getAdminUsers({
      page,
      limit,
      search: search || query || q || "",
      role: role || "",
    });
    res.json({
      success: true,
      data: result,
      message: "Admin users retrieved successfully",
    });
  });
}

export default AccessController;
