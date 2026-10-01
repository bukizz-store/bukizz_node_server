import {
  executeSupabaseQuery,
  executeSupabaseRPC,
  getSupabase,
} from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Access Repository
 * Handles all database operations for RBAC and ABAC access control tables using Supabase.
 */
export class AccessRepository {
  constructor() {
    this.supabase = getSupabase();
    this.permissionsTable = "permissions";
    this.adminRolesTable = "admin_roles";
    this.adminUserRolesTable = "admin_user_roles";
    this.adminRolePermissionsTable = "admin_role_permissions";
    this.adminScopesTable = "admin_scopes";
    this.retailerSchoolAccessTable = "retailer_school_access";
    this.retailerGeneralAccessTable = "retailer_general_access";
  }

  /**
   * Fetches all role-to-permission mappings by joining admin_roles,
   * admin_role_permissions, and permissions.
   * @returns {Promise<Array<{ role_name: string, action_name: string }>>}
   */
  async getAllRolePermissions() {
    try {
      const data = await executeSupabaseQuery(
        this.adminRolePermissionsTable,
        "select",
        {
          select:
            "role_id, permission_id, admin_roles!inner(role_name), permissions!inner(action_name)",
        }
      );

      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .map((item) => ({
          role_name: item.admin_roles?.role_name,
          action_name: item.permissions?.action_name,
        }))
        .filter((item) => item.role_name && item.action_name);
    } catch (error) {
      logger.error("AccessRepository.getAllRolePermissions error:", error);
      throw error;
    }
  }

  /**
   * Fetches administrative scopes (ABAC) for a specific user.
   * @param {string} userId - User UUID
   * @returns {Promise<Array<{ id: string, user_id: string, entity_type: string, entity_id: string|null }>>}
   */
  async getAdminScopes(userId) {
    try {
      const data = await executeSupabaseQuery(this.adminScopesTable, "select", {
        select: "id, user_id, entity_type, entity_id",
        eq: { user_id: userId },
      });

      return Array.isArray(data) ? data : [];
    } catch (error) {
      logger.error("AccessRepository.getAdminScopes error:", { userId, error });
      throw error;
    }
  }

  /**
   * Fetches school access rules (allowed grades & product types) for a specific retailer and school.
   * @param {string} retailerId - Retailer UUID
   * @param {string} schoolId - School UUID
   * @returns {Promise<{ id: string, retailer_id: string, school_id: string, allowed_grades: Array, allowed_types: Array }|null>}
   */
  async getRetailerSchoolAccess(retailerId, schoolId) {
    try {
      const data = await executeSupabaseQuery(
        this.retailerSchoolAccessTable,
        "select",
        {
          select:
            "id, retailer_id, school_id, allowed_grades, allowed_types, created_at, updated_at",
          eq: {
            retailer_id: retailerId,
            school_id: schoolId,
          },
        }
      );

      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (error) {
      logger.error("AccessRepository.getRetailerSchoolAccess error:", {
        retailerId,
        schoolId,
        error,
      });
      throw error;
    }
  }

  /**
   * Fetches general store access rules (allowed category IDs) for a retailer.
   * @param {string} retailerId - Retailer UUID
   * @returns {Promise<{ id: string, retailer_id: string, category_ids: Array }|null>}
   */
  async getRetailerGeneralAccess(retailerId) {
    try {
      const data = await executeSupabaseQuery(
        this.retailerGeneralAccessTable,
        "select",
        {
          select:
            "id, retailer_id, category_ids, created_at, updated_at",
          eq: {
            retailer_id: retailerId,
          },
        }
      );

      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (error) {
      logger.error("AccessRepository.getRetailerGeneralAccess error:", {
        retailerId,
        error,
      });
      throw error;
    }
  }

  /**
   * Fetches the administrative roles assigned to a user from admin_user_roles.
   * @param {string} userId - User UUID
   * @returns {Promise<Array<string>>} Array of role names (e.g. ['superadmin', 'manager'])
   */
  async getUserAdminRoles(userId) {
    try {
      const data = await executeSupabaseQuery(
        this.adminUserRolesTable,
        "select",
        {
          select: "role_id, admin_roles!inner(role_name)",
          eq: { user_id: userId },
        }
      );

      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .map((item) => item.admin_roles?.role_name)
        .filter(Boolean);
    } catch (error) {
      logger.error("AccessRepository.getUserAdminRoles error:", { userId, error });
      throw error;
    }
  }

  /**
   * Alias for getUserAdminRoles for backward compatibility.
   * @param {string} userId - User UUID
   * @returns {Promise<Array<string>>}
   */
  async getUserRoles(userId) {
    return this.getUserAdminRoles(userId);
  }

  /**
   * Evaluates permission directly via PostgreSQL security definer RPC function.
   * @param {string} userId - User UUID
   * @param {string} actionName - Permission string (e.g. 'products:manage')
   * @returns {Promise<boolean>}
   */
  async hasPermissionRPC(userId, actionName) {
    try {
      const result = await executeSupabaseRPC("has_permission", {
        _user_id: userId,
        _action_name: actionName,
      });
      return !!result;
    } catch (error) {
      logger.error("AccessRepository.hasPermissionRPC error:", {
        userId,
        actionName,
        error,
      });
      throw error;
    }
  }

  /**
   * Evaluates admin scope directly via PostgreSQL security definer RPC function.
   * @param {string} userId - User UUID
   * @param {string} entityType - Scope entity type ('SCHOOL', 'CATEGORY', 'RETAILER', 'ALL')
   * @param {string|null} entityId - Optional entity UUID
   * @returns {Promise<boolean>}
   */
  async hasAdminScopeRPC(userId, entityType, entityId = null) {
    try {
      const result = await executeSupabaseRPC("has_admin_scope", {
        _user_id: userId,
        _entity_type: entityType,
        _entity_id: entityId,
      });
      return !!result;
    } catch (error) {
      logger.error("AccessRepository.hasAdminScopeRPC error:", {
        userId,
        entityType,
        entityId,
        error,
      });
      throw error;
    }
  }

  /**
   * Fetches all registered administrative roles.
   * @returns {Promise<Array<Object>>}
   */
  async getAllRoles() {
    try {
      const { data, error } = await this.supabase
        .from(this.adminRolesTable)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error("AccessRepository.getAllRoles error:", error);
      throw error;
    }
  }

  /**
   * Fetches a role by ID.
   * @param {string} roleId
   * @returns {Promise<Object|null>}
   */
  async getRoleById(roleId) {
    try {
      const { data, error } = await this.supabase
        .from(this.adminRolesTable)
        .select("*")
        .eq("id", roleId)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    } catch (error) {
      logger.error("AccessRepository.getRoleById error:", { roleId, error });
      throw error;
    }
  }

  /**
   * Creates a new administrative role.
   * @param {Object} roleData - { roleName, description }
   * @returns {Promise<Object>}
   */
  async createRole({ roleName, description = "" }) {
    try {
      const { data, error } = await this.supabase
        .from(this.adminRolesTable)
        .insert([{ role_name: roleName.trim().toLowerCase(), description }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error("AccessRepository.createRole error:", { roleName, error });
      throw error;
    }
  }

  /**
   * Updates an existing administrative role.
   * @param {string} roleId
   * @param {Object} updateData - { roleName, description }
   * @returns {Promise<Object>}
   */
  async updateRole(roleId, { roleName, description }) {
    try {
      const updates = { updated_at: new Date().toISOString() };
      if (roleName) updates.role_name = roleName.trim().toLowerCase();
      if (description !== undefined) updates.description = description;

      const { data, error } = await this.supabase
        .from(this.adminRolesTable)
        .update(updates)
        .eq("id", roleId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error("AccessRepository.updateRole error:", { roleId, error });
      throw error;
    }
  }

  /**
   * Deletes an administrative role.
   * @param {string} roleId
   * @returns {Promise<boolean>}
   */
  async deleteRole(roleId) {
    try {
      const { error } = await this.supabase
        .from(this.adminRolesTable)
        .delete()
        .eq("id", roleId);
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("AccessRepository.deleteRole error:", { roleId, error });
      throw error;
    }
  }

  /**
   * Fetches the entire permissions catalog.
   * @returns {Promise<Array<Object>>}
   */
  async getAllPermissions() {
    try {
      const { data, error } = await this.supabase
        .from(this.permissionsTable)
        .select("*")
        .order("action_name", { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error("AccessRepository.getAllPermissions error:", error);
      throw error;
    }
  }

  /**
   * Fetches all permissions assigned to a specific role.
   * @param {string} roleId
   * @returns {Promise<Array<{ id: string, action_name: string, description: string }>>}
   */
  async getRolePermissions(roleId) {
    try {
      const { data, error } = await this.supabase
        .from(this.adminRolePermissionsTable)
        .select("permission_id, permissions(id, action_name, description)")
        .eq("role_id", roleId);
      if (error) throw error;
      return (data || []).map((item) => item.permissions).filter(Boolean);
    } catch (error) {
      logger.error("AccessRepository.getRolePermissions error:", { roleId, error });
      throw error;
    }
  }

  /**
   * Sets the complete set of permissions for a role (replaces existing).
   * Supports array of permission action_names (e.g. ['schools:read']) or UUIDs.
   * @param {string} roleId
   * @param {Array<string>} permissionsList
   * @returns {Promise<Array<string>>}
   */
  async setRolePermissions(roleId, permissionsList) {
    try {
      let permissionIds = [];
      if (permissionsList && permissionsList.length > 0) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const uuids = permissionsList.filter((p) => isUuid.test(p));
        const actionNames = permissionsList.filter((p) => !isUuid.test(p));

        permissionIds = [...uuids];
        if (actionNames.length > 0) {
          const { data: matched, error: pError } = await this.supabase
            .from(this.permissionsTable)
            .select("id")
            .in("action_name", actionNames);
          if (pError) throw pError;
          if (matched) {
            matched.forEach((m) => permissionIds.push(m.id));
          }
        }
      }

      permissionIds = [...new Set(permissionIds)];

      // Clear existing
      const { error: delError } = await this.supabase
        .from(this.adminRolePermissionsTable)
        .delete()
        .eq("role_id", roleId);
      if (delError) throw delError;

      // Insert new
      if (permissionIds.length > 0) {
        const rows = permissionIds.map((pId) => ({
          role_id: roleId,
          permission_id: pId,
        }));
        const { error: insError } = await this.supabase
          .from(this.adminRolePermissionsTable)
          .insert(rows);
        if (insError) throw insError;
      }

      return permissionIds;
    } catch (error) {
      logger.error("AccessRepository.setRolePermissions error:", { roleId, error });
      throw error;
    }
  }

  /**
   * Fetches detailed admin roles assigned to a user (including role metadata).
   * @param {string} userId
   * @returns {Promise<Array<Object>>}
   */
  async getUserAdminRolesWithDetails(userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.adminUserRolesTable)
        .select("id, user_id, role_id, created_at, admin_roles(id, role_name, description)")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []).map((item) => ({
        id: item.id,
        userId: item.user_id,
        roleId: item.role_id,
        roleName: item.admin_roles?.role_name,
        description: item.admin_roles?.description,
        createdAt: item.created_at,
      }));
    } catch (error) {
      logger.error("AccessRepository.getUserAdminRolesWithDetails error:", { userId, error });
      throw error;
    }
  }

  /**
   * Assigns an administrative role to a user.
   * @param {string} userId
   * @param {string} roleId
   * @returns {Promise<Object>}
   */
  async assignUserAdminRole(userId, roleId) {
    try {
      const { data, error } = await this.supabase
        .from(this.adminUserRolesTable)
        .upsert([{ user_id: userId, role_id: roleId }], { onConflict: "user_id, role_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error("AccessRepository.assignUserAdminRole error:", { userId, roleId, error });
      throw error;
    }
  }

  /**
   * Removes an administrative role from a user.
   * @param {string} userId
   * @param {string} roleId
   * @returns {Promise<boolean>}
   */
  async removeUserAdminRole(userId, roleId) {
    try {
      const { error } = await this.supabase
        .from(this.adminUserRolesTable)
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId);
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("AccessRepository.removeUserAdminRole error:", { userId, roleId, error });
      throw error;
    }
  }

  /**
   * Sets all administrative roles for a user (replaces existing).
   * @param {string} userId
   * @param {Array<string>} roleIds
   * @returns {Promise<Array<string>>}
   */
  async setUserAdminRoles(userId, roleIds) {
    try {
      const { error: delError } = await this.supabase
        .from(this.adminUserRolesTable)
        .delete()
        .eq("user_id", userId);
      if (delError) throw delError;

      const uniqueRoleIds = [...new Set(roleIds)];
      if (uniqueRoleIds.length > 0) {
        const rows = uniqueRoleIds.map((rId) => ({
          user_id: userId,
          role_id: rId,
        }));
        const { error: insError } = await this.supabase
          .from(this.adminUserRolesTable)
          .insert(rows);
        if (insError) throw insError;

        // Ensure user has admin portal access in users table
        await this.supabase
          .from("users")
          .update({ role: "admin" })
          .eq("id", userId);
      } else {
        // Demote portal access to customer if all admin roles removed
        await this.supabase
          .from("users")
          .update({ role: "customer" })
          .eq("id", userId);
      }

      return uniqueRoleIds;
    } catch (error) {
      logger.error("AccessRepository.setUserAdminRoles error:", { userId, roleIds, error });
      throw error;
    }
  }

  /**
   * Fetches admin users with their assigned admin_roles and admin_scopes.
   * Admin users are users who have role='admin' or have assignments in admin_user_roles.
   *
   * @param {Object} options
   * @param {number} options.page - Page number (1-indexed)
   * @param {number} options.limit - Items per page
   * @param {string} options.search - Search string for full_name, email, or phone
   * @param {string} options.role - Filter by admin_roles.role_name (e.g. 'superadmin', 'manager')
   * @returns {Promise<{ users: Array, total: number, page: number, limit: number, totalPages: number, pages: number }>}
   */
  async getAdminUsers({ page = 1, limit = 20, search = "", role = "" } = {}) {
    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;

      let userIdsToFilter = null;

      // If filtering by a specific admin_role
      if (role && role !== "all") {
        const { data: roleUsers, error: roleErr } = await this.supabase
          .from(this.adminUserRolesTable)
          .select("user_id, admin_roles!inner(role_name)")
          .eq("admin_roles.role_name", role);

        if (roleErr) throw roleErr;

        userIdsToFilter = (roleUsers || []).map((r) => r.user_id);
        if (userIdsToFilter.length === 0) {
          return {
            users: [],
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 1,
            pages: 1,
          };
        }
      }

      // Query users table for admin users
      let query = this.supabase
        .from("users")
        .select(
          "id, full_name, email, phone, role, is_active, created_at, last_login_at",
          { count: "exact" }
        );

      if (userIdsToFilter !== null) {
        query = query.in("id", userIdsToFilter);
      } else {
        // Fetch all user_ids that have admin_user_roles assigned
        const { data: allAdminUserRoles } = await this.supabase
          .from(this.adminUserRolesTable)
          .select("user_id");
        const assignedUserIds = (allAdminUserRoles || []).map((r) => r.user_id);

        if (assignedUserIds.length > 0) {
          query = query.or(`role.eq.admin,id.in.(${assignedUserIds.join(",")})`);
        } else {
          query = query.eq("role", "admin");
        }
      }

      // Search filter
      if (search && String(search).trim()) {
        const safeSearch = String(search).trim().replace(/"/g, '""');
        query = query.or(
          `full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`
        );
      }

      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      const { data: usersData, error: usersErr, count } = await query;
      if (usersErr) throw usersErr;

      const rawUsers = usersData || [];
      const total = count || rawUsers.length;

      if (rawUsers.length === 0) {
        return {
          users: [],
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
          pages: Math.ceil(total / limitNum) || 1,
        };
      }

      const returnedUserIds = rawUsers.map((u) => u.id);

      // Batch fetch admin_user_roles
      const { data: rolesData } = await this.supabase
        .from(this.adminUserRolesTable)
        .select("id, user_id, role_id, created_at, admin_roles(id, role_name, description)")
        .in("user_id", returnedUserIds);

      // Batch fetch admin_scopes
      const { data: scopesData } = await this.supabase
        .from(this.adminScopesTable)
        .select("id, user_id, entity_type, entity_id, created_at")
        .in("user_id", returnedUserIds);

      // Map roles by user_id
      const userRolesMap = new Map();
      if (rolesData) {
        for (const item of rolesData) {
          if (!userRolesMap.has(item.user_id)) {
            userRolesMap.set(item.user_id, []);
          }
          userRolesMap.get(item.user_id).push({
            id: item.id,
            roleId: item.role_id,
            roleName: item.admin_roles?.role_name,
            description: item.admin_roles?.description,
            createdAt: item.created_at,
          });
        }
      }

      // Map scopes by user_id
      const userScopesMap = new Map();
      if (scopesData) {
        for (const item of scopesData) {
          if (!userScopesMap.has(item.user_id)) {
            userScopesMap.set(item.user_id, []);
          }
          userScopesMap.get(item.user_id).push({
            id: item.id,
            entityType: item.entity_type,
            entityId: item.entity_id,
            createdAt: item.created_at,
          });
        }
      }

      // Enrich users
      const users = rawUsers.map((u) => {
        const assignedRoles = userRolesMap.get(u.id) || [];
        const assignedScopes = userScopesMap.get(u.id) || [];
        return {
          id: u.id,
          fullName: u.full_name || null,
          email: u.email,
          phone: u.phone || null,
          isActive: Boolean(u.is_active),
          portalRole: u.role, // 'admin'
          createdAt: u.created_at,
          lastLoginAt: u.last_login_at,
          roles: assignedRoles,
          scopes: assignedScopes,
          primaryRole: assignedRoles.length > 0 ? assignedRoles[0].roleName : null,
        };
      });

      return {
        users,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        pages: Math.ceil(total / limitNum) || 1,
      };
    } catch (error) {
      logger.error("AccessRepository.getAdminUsers error:", error);
      throw error;
    }
  }

  /**
   * Adds an admin scope (ABAC) constraint for a user.
   * @param {string} userId
   * @param {string} entityType - 'SCHOOL' | 'CATEGORY' | 'RETAILER' | 'ALL'
   * @param {string|null} entityId
   * @returns {Promise<Object>}
   */
  async addAdminScope(userId, entityType, entityId = null) {
    try {
      const { data, error } = await this.supabase
        .from(this.adminScopesTable)
        .insert([{ user_id: userId, entity_type: entityType, entity_id: entityId || null }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error("AccessRepository.addAdminScope error:", { userId, entityType, entityId, error });
      throw error;
    }
  }

  /**
   * Removes an admin scope by its ID.
   * @param {string} scopeId
   * @returns {Promise<boolean>}
   */
  async deleteAdminScope(scopeId) {
    try {
      const { error } = await this.supabase
        .from(this.adminScopesTable)
        .delete()
        .eq("id", scopeId);
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("AccessRepository.deleteAdminScope error:", { scopeId, error });
      throw error;
    }
  }
}

/**
 * Factory function for creating AccessRepository instances
 * @returns {AccessRepository}
 */
export const createAccessRepository = () => new AccessRepository();

export default AccessRepository;
