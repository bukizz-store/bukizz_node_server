import authService from "../services/authService.js";
import { logger } from "../utils/logger.js";

/**
 * JWT Authentication middleware
 * Verifies JWT tokens and adds user info to request object
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

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
    const token = authHeader && authHeader.split(" ")[1];

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
 * Role-based authorization middleware
 * Note: Role system not implemented in current schema, placeholder for future use
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

    // TODO: Implement role system when roles are added to user schema
    const userRoles = req.user.roles || [];
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
