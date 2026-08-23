import { executeSupabaseQuery, executeSupabaseRPC } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Access Repository
 * Handles all database operations for RBAC and ABAC access control tables using Supabase.
 */
export class AccessRepository {
  constructor() {
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

      return data.map((item) => ({
        role_name: item.admin_roles?.role_name,
        action_name: item.permissions?.action_name,
      })).filter((item) => item.role_name && item.action_name);
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
   * Fetches the administrative roles assigned to a user.
   * @param {string} userId - User UUID
   * @returns {Promise<Array<string>>} Array of role names (e.g. ['manager', 'support'])
   */
  async getUserRoles(userId) {
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
      logger.error("AccessRepository.getUserRoles error:", { userId, error });
      throw error;
    }
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
}

/**
 * Factory function for creating AccessRepository instances
 * @returns {AccessRepository}
 */
export const createAccessRepository = () => new AccessRepository();

export default AccessRepository;
