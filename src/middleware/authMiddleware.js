import authService from "../services/authService.js";
import { AppError } from "./errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * JWT Authentication middleware
 * Verifies JWT tokens and adds user info to request object
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    let token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    // Check cookie if header missing
    if (!token && req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access denied",
        message: "No token provided",
      });
    }

    // Use auth service to verify token and get user data
    const result = await authService.verifyToken(token);

    if (!result.valid) {
      logger.warn("Invalid token attempt", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        error: result.error,
      });

      if (result.error?.includes("expired")) {
        return res.status(401).json({
          success: false,
          error: "Token expired",
          message: "Please refresh your token",
        });
      }

      return res.status(403).json({
        success: false,
        error: "Invalid token",
        message: "Token verification failed",
      });
    }

    // Add user data to request
    req.user = result.user;
    req.tokenData = result.decoded;
    req.token = token; // Make raw token available for downstream services
    next();
  } catch (error) {
    logger.error("Authentication middleware error:", error);
    return res.status(500).json({
      success: false,
      error: "Authentication error",
      message: "Internal server error during authentication",
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info if token exists but doesn't require authentication
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    let token = authHeader && authHeader.split(" ")[1];

    // Check cookie if header missing
    if (!token && req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next();
    }

    const result = await authService.verifyToken(token);

    if (result.valid) {
      req.user = result.user;
      req.tokenData = result.decoded;
    } else {
      // Log but don't block request for optional auth
      logger.debug("Optional auth failed", { error: result.error });
    }

    next();
  } catch (error) {
    logger.debug("Optional auth error:", error);
    next(); // Continue without authentication for optional auth
  }
};

/**
 * Role-based authorization middleware (Legacy)
 */
export const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "Please login to access this resource",
      });
    }

    const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole && roles.length > 0) {
      logger.warn("Unauthorized access attempt", {
        userId: req.user.id,
        requiredRoles: roles,
        userRoles,
      });

      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
};

/**
 * Resource ownership middleware
 * Ensures user can only access their own resources
 */
export const requireOwnership = (paramName = "userId") => {
  return (req, res, next) => {
    const resourceUserId = req.params[paramName];
    const requestingUserId = req.user?.id; // Use 'id' field from user object

    if (!requestingUserId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "Please login to access this resource",
      });
    }

    if (resourceUserId !== requestingUserId) {
      logger.warn("Unauthorized resource access attempt", {
        requestingUserId,
        resourceUserId,
        endpoint: req.originalUrl,
      });

      return res.status(403).json({
        success: false,
        error: "Access denied",
        message: "You can only access your own resources",
      });
    }

    next();
  };
};

/**
 * Middleware to ensure user account is verified
 */
export const requireVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
      message: "Please login to access this resource",
    });
  }

  if (!req.user.email_verified) {
    return res.status(403).json({
      success: false,
      error: "Email verification required",
      message: "Please verify your email address to access this resource",
    });
  }

  next();
};

/**
 * Middleware to ensure user account is active
 */
export const requireActiveUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
      message: "Please login to access this resource",
    });
  }

  if (!req.user.is_active) {
    return res.status(403).json({
      success: false,
      error: "Account inactive",
      message: "Your account has been deactivated. Please contact support.",
    });
  }

  next();
};

// ============================================================================
// HYBRID RBAC + ABAC ACCESS CONTROL MIDDLEWARE
// ============================================================================

/**
 * Enforces Role-Based Access Control (RBAC).
 * Performs an O(1) in-memory lookup against the cached role-permission mappings.
 * @param {Object} accessService - Injected AccessService instance from DI container
 * @param {string|Array<string>} requiredPermissions - Required permission string(s) (e.g. 'products:manage')
 * @returns {Function} Express middleware function
 */
export const requirePermissions = (accessService, ...requiredPermissions) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required. Please login.", 401);
      }

      if (!accessService) {
        logger.error("requirePermissions middleware error: accessService not provided");
        throw new AppError("Access service unavailable", 500);
      }

      const roles = req.user.roles || (req.user.role ? [req.user.role] : []);
      
      // Flatten requiredPermissions in case arrays or comma-separated strings were passed
      const permissionsList = requiredPermissions.flat();

      // hasPermission evaluates in O(1) time and throws 403 AppError on violation
      accessService.hasPermission(roles, permissionsList);

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Enforces Attribute-Based Access Control (ABAC) for retailers interacting with school-tagged resources.
 * Validates retailer-school pairing, allowed grade levels, and allowed product types with LRU micro-caching.
 * @param {Object} accessService - Injected AccessService instance from DI container
 * @returns {Function} Express middleware function
 */
export const requireRetailerSchoolScope = (accessService) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required. Please login.", 401);
      }

      if (!accessService) {
        logger.error("requireRetailerSchoolScope middleware error: accessService not provided");
        throw new AppError("Access service unavailable", 500);
      }

      const userId = req.user.id || req.user._id;
      const roles = req.user.roles || (req.user.role ? [req.user.role] : []);

      // Admins & Managers bypass retailer school scope checks
      if (roles.includes("superadmin") || roles.includes("admin") || roles.includes("manager")) {
        return next();
      }

      // Ensure user has retailer role
      if (!roles.includes("retailer")) {
        throw new AppError("Access denied: Retailer role required", 403);
      }

      // Extract schoolId from params, body, or query
      const schoolId = req.params.schoolId || req.body.schoolId || req.query.schoolId;
      if (!schoolId) {
        throw new AppError("School ID is required for school-scoped operations", 400);
      }

      // Extract optional attributes
      const grade = req.body?.grade || req.query?.grade || null;
      const productType = req.body?.productType || req.query?.productType || null;

      // Validate against bounded LRU micro-cache / Supabase
      await accessService.validateRetailerSchoolScope(userId, schoolId, grade, productType);

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Enforces Attribute-Based Access Control (ABAC) for retailers managing general store categories.
 * Validates category authorization with LRU micro-caching.
 * @param {Object} accessService - Injected AccessService instance from DI container
 * @returns {Function} Express middleware function
 */
export const requireRetailerGeneralScope = (accessService) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required. Please login.", 401);
      }

      if (!accessService) {
        logger.error("requireRetailerGeneralScope middleware error: accessService not provided");
        throw new AppError("Access service unavailable", 500);
      }

      const userId = req.user.id || req.user._id;
      const roles = req.user.roles || (req.user.role ? [req.user.role] : []);

      if (roles.includes("superadmin") || roles.includes("admin") || roles.includes("manager")) {
        return next();
      }

      if (!roles.includes("retailer")) {
        throw new AppError("Access denied: Retailer role required", 403);
      }

      const categoryId = req.params.categoryId || req.body.categoryId || req.query.categoryId;
      if (!categoryId) {
        throw new AppError("Category ID is required for general catalog operations", 400);
      }

      await accessService.validateRetailerGeneralScope(userId, categoryId);

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Enforces Attribute-Based Access Control (ABAC) for administrative staff with scoped entity constraints.
 * @param {Object} accessService - Injected AccessService instance from DI container
 * @param {string} entityType - Entity type ('SCHOOL', 'CATEGORY', 'RETAILER', 'ALL')
 * @param {string} [idParamName='id'] - Name of req.params or req.body field containing the entity UUID
 * @returns {Function} Express middleware function
 */
export const requireAdminScope = (accessService, entityType, idParamName = "id") => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required. Please login.", 401);
      }

      if (!accessService) {
        logger.error("requireAdminScope middleware error: accessService not provided");
        throw new AppError("Access service unavailable", 500);
      }

      const userId = req.user.id || req.user._id;
      const roles = req.user.roles || (req.user.role ? [req.user.role] : []);

      if (roles.includes("superadmin")) {
        return next();
      }

      const entityId = req.params[idParamName] || req.body[idParamName] || req.query[idParamName] || null;

      await accessService.validateAdminScope(userId, entityType, entityId);

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Enforces ABAC scope for comprehensive product creation.
 * If user is a retailer:
 * - If schoolId is present in request body, validates retailer school scope.
 * - Otherwise (general catalog), validates retailer general category scope.
 * Admin and managers bypass this check.
 * @param {Object} accessService - Injected AccessService instance
 * @returns {Function} Express middleware function
 */
export const requireProductCreationScope = (accessService) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required. Please login.", 401);
      }

      if (!accessService) {
        logger.error("requireProductCreationScope error: accessService not provided");
        throw new AppError("Access service unavailable", 500);
      }

      const userId = req.user.id || req.user._id;
      const roles = req.user.roles || (req.user.role ? [req.user.role] : []);

      // Admins & Managers bypass retailer scope validation
      if (roles.includes("superadmin") || roles.includes("admin") || roles.includes("manager")) {
        return next();
      }

      // If user is a retailer, validate appropriate scope
      if (roles.includes("retailer")) {
        const schoolId = req.body?.schoolId;
        const categoryId = req.body?.categoryId;

        if (schoolId) {
          const grade = req.body?.grade || null;
          const productType = req.body?.productType || null;
          await accessService.validateRetailerSchoolScope(
            userId,
            schoolId,
            grade,
            productType
          );
        } else if (categoryId) {
          await accessService.validateRetailerGeneralScope(userId, categoryId);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
