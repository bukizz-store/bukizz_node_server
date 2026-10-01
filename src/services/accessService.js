import LRU from "lru-cache";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

// Handle both default and named export across lru-cache versions
const LRUCache = LRU.LRUCache || LRU;

/**
 * Access Service
 * Implements high-performance in-memory RBAC role-permission evaluation
 * and bounded LRU micro-caching for ABAC multi-tenant entity scoping.
 */
export class AccessService {
  /**
   * @param {Object} accessRepository - Data access repository for RBAC & ABAC
   */
  constructor(accessRepository) {
    if (!accessRepository) {
      throw new Error("AccessService requires an accessRepository instance");
    }
    this.accessRepository = accessRepository;

    // RBAC in-memory role-to-permission mapping: Map<roleName, Set<permissionString>>
    this.rolePermissionsCache = new Map();

    // ABAC bounded micro-cache (Strategy B: max 500 items, 5 min TTL)
    this.abacCache = new LRUCache({
      max: 500,
      ttl: 1000 * 60 * 5, // 5 minutes TTL
      allowStale: false,
      updateAgeOnGet: true,
    });
  }

  /**
   * Bootstraps and warms the in-memory role-permission cache from the database.
   * Called during server startup to enable instantaneous O(1) RBAC evaluations.
   * @returns {Promise<{ roleCount: number, mappingCount: number }>}
   */
  async initialize() {
    try {
      logger.info("Initializing AccessService in-memory RBAC cache...");
      const mappings = await this.accessRepository.getAllRolePermissions();

      const newCache = new Map();
      let totalMappings = 0;

      for (const item of mappings) {
        const { role_name, action_name } = item;
        if (!role_name || !action_name) continue;

        if (!newCache.has(role_name)) {
          newCache.set(role_name, new Set());
        }
        newCache.get(role_name).add(action_name);
        totalMappings++;
      }

      this.rolePermissionsCache = newCache;

      logger.info(
        `AccessService initialized successfully with ${this.rolePermissionsCache.size} roles and ${totalMappings} permission mappings.`
      );

      return {
        roleCount: this.rolePermissionsCache.size,
        mappingCount: totalMappings,
      };
    } catch (error) {
      logger.error("Failed to initialize AccessService RBAC cache:", error);
      // Do not crash server, but log critical warning
      return { roleCount: 0, mappingCount: 0 };
    }
  }

  /**
   * Fast O(1) RBAC check against the in-memory role-permission cache.
   * Throws 403 AppError if required permissions are missing.
   * @param {string|Array<string>} roles - User roles (e.g. 'manager' or ['manager', 'support'])
   * @param {string|Array<string>} requiredPermissions - Required permission strings
   * @returns {boolean} True if authorized
   * @throws {AppError} 403 Forbidden if unauthorized
   */
  hasPermission(roles, requiredPermissions) {
    const rolesArray = (
      Array.isArray(roles) ? roles : roles ? [roles] : []
    ).map((r) => String(r).toLowerCase().trim());

    const requiredArray = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : requiredPermissions
      ? [requiredPermissions]
      : [];

    // Superadmin role bypasses all RBAC permission checks
    if (rolesArray.includes("superadmin")) {
      return true;
    }

    if (requiredArray.length === 0) {
      return true;
    }

    // Aggregate all permissions granted by user's active roles
    const userPermissions = new Set();
    for (const role of rolesArray) {
      const perms = this.rolePermissionsCache.get(role);
      if (perms) {
        perms.forEach((p) => userPermissions.add(p));
      }
    }

    // Verify all required permissions are present
    const hasAll = requiredArray.every((perm) => userPermissions.has(perm));

    if (!hasAll) {
      const missing = requiredArray.filter((p) => !userPermissions.has(p));
      logger.warn("AccessService: RBAC permission check failed", {
        roles: rolesArray,
        required: requiredArray,
        missing,
      });

      throw new AppError(
        "Forbidden: Insufficient permissions to access this resource",
        403
      );
    }

    return true;
  }

  /**
   * Non-throwing boolean check for RBAC permissions (useful for conditional UI/DTOs).
   * @param {string|Array<string>} roles - User roles
   * @param {string|Array<string>} requiredPermissions - Required permissions
   * @returns {boolean}
   */
  checkPermission(roles, requiredPermissions) {
    try {
      return this.hasPermission(roles, requiredPermissions);
    } catch {
      return false;
    }
  }

  /**
   * Returns all resolved permission strings for a given array of roles.
   * Superadmin role receives the union of all registered permissions.
   * @param {string|Array<string>} roles - User roles (e.g. ['superadmin'] or ['manager'])
   * @returns {Array<string>} List of distinct permission strings
   */
  getUserPermissions(roles) {
    const rolesArray = (
      Array.isArray(roles) ? roles : roles ? [roles] : []
    ).map((r) => String(r).toLowerCase().trim());

    if (rolesArray.includes("superadmin")) {
      // Superadmin receives all known permissions in the cache
      const allPerms = new Set();
      for (const perms of this.rolePermissionsCache.values()) {
        perms.forEach((p) => allPerms.add(p));
      }
      return Array.from(allPerms);
    }

    const userPerms = new Set();
    for (const role of rolesArray) {
      const perms = this.rolePermissionsCache.get(role);
      if (perms) {
        perms.forEach((p) => userPerms.add(p));
      }
    }

    return Array.from(userPerms);
  }

  /**
   * Resolves all granted permission strings for a specific user ID by querying their
   * active roles from admin_user_roles in database and evaluating them against the in-memory RBAC cache.
   * @param {string} userId - User UUID
   * @returns {Promise<Array<string>>} Distinct list of permission strings
   */
  async getPermissionsForUser(userId) {
    if (!userId) {
      return [];
    }

    try {
      // Fetch user's assigned admin roles from the database
      const roles = await this.accessRepository.getUserAdminRoles(userId);

      // Evaluate and return permissions array
      return this.getUserPermissions(roles);
    } catch (error) {
      logger.error("AccessService.getPermissionsForUser error:", { userId, error });
      return [];
    }
  }

  /**
   * Validates retailer school-level ABAC scope with LRU micro-caching.
   * @param {string} retailerId - Retailer UUID
   * @param {string} schoolId - School UUID
   * @param {string|null} grade - Optional grade attribute (e.g. 'NURSERY', '5')
   * @param {string|null} productType - Optional product type attribute (e.g. 'bookset', 'uniform')
   * @returns {Promise<boolean>} True if authorized
   * @throws {AppError} 403 Forbidden if scope or attribute check fails
   */
  async validateRetailerSchoolScope(retailerId, schoolId, grade = null, productType = null) {
    if (!retailerId || !schoolId) {
      throw new AppError("Invalid scope parameters: retailerId and schoolId are required", 400);
    }

    const cacheKey = `retailer_school:${retailerId}:${schoolId}`;
    let accessRecord = this.abacCache.get(cacheKey);

    if (accessRecord === undefined) {
      accessRecord = await this.accessRepository.getRetailerSchoolAccess(
        retailerId,
        schoolId
      );

      // Cache the record (or null for negative caching)
      this.abacCache.set(cacheKey, accessRecord);
    }

    if (!accessRecord) {
      logger.warn("AccessService: Retailer not authorized for school", {
        retailerId,
        schoolId,
      });
      throw new AppError(
        "Forbidden: Retailer does not have access to this school",
        403
      );
    }

    // Validate grade attribute if requested
    if (grade) {
      const allowedGrades = Array.isArray(accessRecord.allowed_grades)
        ? accessRecord.allowed_grades.map((g) => String(g).trim().toUpperCase())
        : [];

      const normalizedGrade = String(grade).trim().toUpperCase();
      if (allowedGrades.length > 0 && !allowedGrades.includes(normalizedGrade)) {
        logger.warn("AccessService: Retailer school grade scope mismatch", {
          retailerId,
          schoolId,
          grade,
          allowedGrades,
        });
        throw new AppError(
          `Forbidden: Retailer is not authorized for grade '${grade}' at this school`,
          403
        );
      }
    }

    // Validate product type attribute if requested
    if (productType) {
      const allowedTypes = Array.isArray(accessRecord.allowed_types)
        ? accessRecord.allowed_types.map((t) => String(t).trim().toLowerCase())
        : [];

      const normalizedType = String(productType).trim().toLowerCase();
      if (allowedTypes.length > 0 && !allowedTypes.includes(normalizedType)) {
        logger.warn("AccessService: Retailer school product type mismatch", {
          retailerId,
          schoolId,
          productType,
          allowedTypes,
        });
        throw new AppError(
          `Forbidden: Retailer is not authorized for product type '${productType}' at this school`,
          403
        );
      }
    }

    return true;
  }

  /**
   * Validates retailer general store category ABAC scope with LRU micro-caching.
   * @param {string} retailerId - Retailer UUID
   * @param {string} categoryId - Category UUID
   * @returns {Promise<boolean>} True if authorized
   * @throws {AppError} 403 Forbidden if category is not allowed
   */
  async validateRetailerGeneralScope(retailerId, categoryId) {
    if (!retailerId || !categoryId) {
      throw new AppError("Invalid scope parameters: retailerId and categoryId are required", 400);
    }

    const cacheKey = `retailer_general:${retailerId}`;
    let accessRecord = this.abacCache.get(cacheKey);

    if (accessRecord === undefined) {
      accessRecord = await this.accessRepository.getRetailerGeneralAccess(retailerId);
      this.abacCache.set(cacheKey, accessRecord);
    }

    if (!accessRecord) {
      logger.warn("AccessService: Retailer general access record not found", {
        retailerId,
        categoryId,
      });
      throw new AppError(
        "Forbidden: Retailer is not authorized for general catalog products",
        403
      );
    }

    const allowedCategories = Array.isArray(accessRecord.category_ids)
      ? accessRecord.category_ids
      : [];

    if (allowedCategories.length > 0 && !allowedCategories.includes(categoryId)) {
      logger.warn("AccessService: Retailer general category mismatch", {
        retailerId,
        categoryId,
        allowedCategories,
      });
      throw new AppError(
        "Forbidden: Retailer is not authorized to manage products in this category",
        403
      );
    }

    return true;
  }

  /**
   * Validates administrative ABAC scope for an admin/manager user with LRU micro-caching.
   * @param {string} userId - User UUID
   * @param {string} entityType - Entity type ('SCHOOL', 'CATEGORY', 'RETAILER', 'ALL')
   * @param {string|null} entityId - Optional target entity UUID
   * @returns {Promise<boolean>} True if authorized
   * @throws {AppError} 403 Forbidden if outside assigned scope
   */
  async validateAdminScope(userId, entityType, entityId = null) {
    if (!userId || !entityType) {
      throw new AppError("Invalid scope parameters: userId and entityType are required", 400);
    }

    const cacheKey = `admin_scopes:${userId}`;
    let scopes = this.abacCache.get(cacheKey);

    if (scopes === undefined) {
      scopes = await this.accessRepository.getAdminScopes(userId);
      this.abacCache.set(cacheKey, scopes);
    }

    if (!Array.isArray(scopes) || scopes.length === 0) {
      logger.warn("AccessService: User has no assigned admin scopes", {
        userId,
        entityType,
        entityId,
      });
      throw new AppError(
        `Forbidden: Access denied outside assigned administrative scope (${entityType})`,
        403
      );
    }

    // Check for global 'ALL' scope
    const hasGlobalScope = scopes.some((s) => s.entity_type === "ALL");
    if (hasGlobalScope) {
      return true;
    }

    // Check for matching entity type and entity ID
    const hasEntityScope = scopes.some(
      (s) =>
        s.entity_type === entityType &&
        (s.entity_id === null || s.entity_id === entityId)
    );

    if (!hasEntityScope) {
      logger.warn("AccessService: Admin scope check failed", {
        userId,
        entityType,
        entityId,
        userScopes: scopes,
      });
      throw new AppError(
        `Forbidden: Access denied outside assigned administrative scope (${entityType})`,
        403
      );
    }

    return true;
  }

  /**
   * Re-synchronizes the in-memory role-permission cache with the database.
   * @returns {Promise<{ roleCount: number, mappingCount: number }>}
   */
  async refreshRoleCache() {
    logger.info("AccessService: Refreshing in-memory RBAC role permissions cache...");
    return await this.initialize();
  }

  /**
   * Evicts a retailer's school access record from the ABAC LRU micro-cache.
   * @param {string} retailerId - Retailer UUID
   * @param {string} schoolId - School UUID
   */
  invalidateRetailerSchoolAccess(retailerId, schoolId) {
    const cacheKey = `retailer_school:${retailerId}:${schoolId}`;
    this.abacCache.delete(cacheKey);
    logger.debug(`AccessService: Evicted ABAC cache key '${cacheKey}'`);
  }

  /**
   * Evicts a retailer's general store access record from the ABAC LRU micro-cache.
   * @param {string} retailerId - Retailer UUID
   */
  invalidateRetailerGeneralAccess(retailerId) {
    const cacheKey = `retailer_general:${retailerId}`;
    this.abacCache.delete(cacheKey);
    logger.debug(`AccessService: Evicted ABAC cache key '${cacheKey}'`);
  }

  /**
   * Evicts an admin user's scopes from the ABAC LRU micro-cache.
   * @param {string} userId - User UUID
   */
  invalidateAdminScope(userId) {
    const cacheKey = `admin_scopes:${userId}`;
    this.abacCache.delete(cacheKey);
    logger.debug(`AccessService: Evicted ABAC cache key '${cacheKey}'`);
  }

  /**
   * Clears the entire ABAC LRU micro-cache.
   */
  clearCache() {
    this.abacCache.clear();
    logger.info("AccessService: Cleared all entries from ABAC LRU micro-cache");
  }

  /**
   * Fetches all registered administrative roles.
   * @returns {Promise<Array<Object>>}
   */
  async getAllRoles() {
    return await this.accessRepository.getAllRoles();
  }

  /**
   * Fetches a role by ID.
   * @param {string} roleId
   * @returns {Promise<Object>}
   */
  async getRoleById(roleId) {
    const role = await this.accessRepository.getRoleById(roleId);
    if (!role) {
      throw new AppError("Role not found", 404);
    }
    return role;
  }

  /**
   * Creates a new administrative role and optionally assigns permissions.
   * Automatically refreshes in-memory RBAC cache.
   * @param {Object} roleData - { roleName, description, permissions }
   * @returns {Promise<Object>}
   */
  async createRole({ roleName, description, permissions = [] }) {
    if (!roleName) {
      throw new AppError("Role name is required", 400);
    }

    const createdRole = await this.accessRepository.createRole({
      roleName,
      description,
    });

    if (Array.isArray(permissions) && permissions.length > 0) {
      await this.accessRepository.setRolePermissions(createdRole.id, permissions);
    }

    await this.refreshRoleCache();
    return createdRole;
  }

  /**
   * Updates an existing role and optionally updates its permissions.
   * Automatically refreshes in-memory RBAC cache.
   * @param {string} roleId
   * @param {Object} updateData - { roleName, description, permissions }
   * @returns {Promise<Object>}
   */
  async updateRole(roleId, { roleName, description, permissions }) {
    const existing = await this.getRoleById(roleId);

    // Prevent modifying reserved system roles' names
    if (["superadmin"].includes(existing.role_name) && roleName && roleName !== existing.role_name) {
      throw new AppError("Cannot rename root superadmin role", 400);
    }

    const updatedRole = await this.accessRepository.updateRole(roleId, {
      roleName,
      description,
    });

    if (Array.isArray(permissions)) {
      await this.accessRepository.setRolePermissions(roleId, permissions);
    }

    await this.refreshRoleCache();
    return updatedRole;
  }

  /**
   * Deletes a role.
   * Prevents deleting the protected 'superadmin' role.
   * @param {string} roleId
   * @returns {Promise<boolean>}
   */
  async deleteRole(roleId) {
    const existing = await this.getRoleById(roleId);
    if (["superadmin", "manager", "support"].includes(existing.role_name)) {
      throw new AppError(`Cannot delete built-in system role '${existing.role_name}'`, 400);
    }

    await this.accessRepository.deleteRole(roleId);
    await this.refreshRoleCache();
    return true;
  }

  /**
   * Fetches the complete system permissions catalog.
   * @returns {Promise<Array<Object>>}
   */
  async getAllPermissions() {
    return await this.accessRepository.getAllPermissions();
  }

  /**
   * Fetches all permissions assigned to a role.
   * @param {string} roleId
   * @returns {Promise<Array<Object>>}
   */
  async getRolePermissions(roleId) {
    await this.getRoleById(roleId);
    return await this.accessRepository.getRolePermissions(roleId);
  }

  /**
   * Sets (replaces) all permissions for a role.
   * Automatically refreshes in-memory RBAC cache.
   * @param {string} roleId
   * @param {Array<string>} permissions
   * @returns {Promise<Array<string>>}
   */
  async setRolePermissions(roleId, permissions) {
    await this.getRoleById(roleId);
    const result = await this.accessRepository.setRolePermissions(roleId, permissions);
    await this.refreshRoleCache();
    return result;
  }

  /**
   * Fetches user's assigned administrative roles with role details.
   * @param {string} userId
   * @returns {Promise<Array<Object>>}
   */
  async getUserAdminRolesWithDetails(userId) {
    return await this.accessRepository.getUserAdminRolesWithDetails(userId);
  }

  /**
   * Assigns an administrative role to a user.
   * @param {string} userId
   * @param {string} roleId
   * @returns {Promise<Object>}
   */
  async assignUserAdminRole(userId, roleId) {
    await this.getRoleById(roleId);
    const result = await this.accessRepository.assignUserAdminRole(userId, roleId);
    return result;
  }

  /**
   * Removes an administrative role from a user.
   * @param {string} userId
   * @param {string} roleId
   * @returns {Promise<boolean>}
   */
  async removeUserAdminRole(userId, roleId) {
    return await this.accessRepository.removeUserAdminRole(userId, roleId);
  }

  /**
   * Sets all administrative roles for a user (replaces existing).
   * @param {string} userId
   * @param {Array<string>} roleIds
   * @returns {Promise<Array<string>>}
   */
  async setUserAdminRoles(userId, roleIds) {
    return await this.accessRepository.setUserAdminRoles(userId, roleIds);
  }

  /**
   * Fetches administrative scopes (ABAC) for a user.
   * @param {string} userId
   * @returns {Promise<Array<Object>>}
   */
  async getAdminScopes(userId) {
    return await this.accessRepository.getAdminScopes(userId);
  }

  /**
   * Adds an admin scope constraint for a user and invalidates user scope cache.
   * @param {string} userId
   * @param {string} entityType - 'SCHOOL' | 'CATEGORY' | 'RETAILER' | 'ALL'
   * @param {string|null} entityId
   * @returns {Promise<Object>}
   */
  async addAdminScope(userId, entityType, entityId = null) {
    const result = await this.accessRepository.addAdminScope(userId, entityType, entityId);
    this.invalidateAdminScope(userId);
    return result;
  }

  /**
   * Removes an admin scope constraint for a user and invalidates user scope cache.
   * @param {string} userId
   * @param {string} scopeId
   * @returns {Promise<boolean>}
   */
  async removeAdminScope(userId, scopeId) {
    const result = await this.accessRepository.deleteAdminScope(scopeId);
    this.invalidateAdminScope(userId);
    return result;
  }

  /**
   * Fetches admin users with their assigned admin_roles and admin_scopes.
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async getAdminUsers(options) {
    return this.accessRepository.getAdminUsers(options);
  }

  /**
   * Returns cache diagnostics and current memory footprint telemetry.
   * @returns {Object}
   */
  getCacheStats() {
    return {
      rbacRoleCount: this.rolePermissionsCache.size,
      abacCacheSize: this.abacCache.size,
      abacCacheMax: this.abacCache.max,
      abacCacheCalculatedSize: this.abacCache.calculatedSize,
    };
  }
}

/**
 * Factory function for creating AccessService instances
 * @param {Object} options - { accessRepository }
 * @returns {AccessService}
 */
export const createAccessService = ({ accessRepository }) =>
  new AccessService(accessRepository);

export default createAccessService;
