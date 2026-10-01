import defaultAuthService from "../services/authService.js";
import { logger } from "../utils/logger.js";

// Helper to set cookies and send response
const sendTokenResponse = (res, result, message, statusCode = 200) => {
  const { accessToken, refreshToken, expiresIn, ...data } = result;

  const isProduction = process.env.NODE_ENV === "production";

  if (accessToken) {
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24h default
    });
  }

  if (refreshToken) {
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: (expiresIn || 7 * 24 * 60 * 60) * 1000,
    });
  }

  const responseData = {
    ...data,
    accessToken,
    refreshToken,
  };

  res.status(statusCode).json({
    success: true,
    message,
    data: responseData,
  });
};

export class AuthController {
  constructor(deps = {}) {
    if (deps && (deps.authService || deps.userService || deps.accessService)) {
      this.authService = deps.authService || defaultAuthService;
      this.userService = deps.userService || null;
      this.accessService = deps.accessService || null;
    } else if (deps && deps.login) {
      this.authService = deps;
      this.userService = null;
      this.accessService = null;
    } else {
      this.authService = defaultAuthService;
      this.userService = null;
      this.accessService = null;
    }

    // Bind methods to preserve context
    this.register = this.register.bind(this);
    this.registerRetailer = this.registerRetailer.bind(this);
    this.sendRetailerOtp = this.sendRetailerOtp.bind(this);
    this.verifyRetailerOtp = this.verifyRetailerOtp.bind(this);
    this.verifyRetailer = this.verifyRetailer.bind(this);
    this.loginRetailer = this.loginRetailer.bind(this);
    this.login = this.login.bind(this);
    this.googleLogin = this.googleLogin.bind(this);
    this.appleLogin = this.appleLogin.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
    this.logout = this.logout.bind(this);
    this.deleteAccount = this.deleteAccount.bind(this);
    this.requestPasswordReset = this.requestPasswordReset.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.verifyToken = this.verifyToken.bind(this);
    this.sendOtp = this.sendOtp.bind(this);
    this.verifyOtp = this.verifyOtp.bind(this);
    this.registerDeliveryPartner = this.registerDeliveryPartner.bind(this);
    this.approveDeliveryPartner = this.approveDeliveryPartner.bind(this);
    this.getPendingDeliveryPartnersList = this.getPendingDeliveryPartnersList.bind(this);
    this.loginDeliveryPartner = this.loginDeliveryPartner.bind(this);
    this.resendDeliveryPartnerPin = this.resendDeliveryPartnerPin.bind(this);
    this.getPermissions = this.getPermissions.bind(this);
    this._attachPermissions = this._attachPermissions.bind(this);
  }

  /**
   * Helper to attach live computed roles and permissions from admin_user_roles to a user object
   * @private
   */
  async _attachPermissions(user) {
    if (!user) return user;

    let permissions = [];
    let roles = [];

    let accessSvc = this.accessService;
    if (!accessSvc) {
      try {
        const { createDependencies } = await import("../config/dependencies.js");
        const deps = await createDependencies();
        accessSvc = deps.accessService;
        if (!this.accessService && accessSvc) {
          this.accessService = accessSvc;
        }
      } catch (e) {
        logger.warn("AuthController: Failed to resolve accessService via DI:", e.message);
      }
    }

    let scopes = [];
    if (accessSvc && user.id) {
      // Query live permissions based on admin_user_roles lookup
      permissions = await accessSvc.getPermissionsForUser(user.id);

      if (accessSvc.accessRepository?.getUserAdminRoles) {
        roles = await accessSvc.accessRepository.getUserAdminRoles(user.id);
      }

      if (accessSvc.getAdminScopes) {
        try {
          scopes = await accessSvc.getAdminScopes(user.id);
        } catch (err) {
          logger.warn("AuthController: Failed to fetch admin scopes:", err.message);
        }
      }
    }

    const effectiveRoles =
      roles.length > 0
        ? roles
        : Array.isArray(user.roles) && user.roles.length > 0
        ? user.roles
        : user.role
        ? [user.role]
        : [];

    if (permissions.length === 0 && effectiveRoles.length > 0 && accessSvc) {
      permissions = accessSvc.getUserPermissions(effectiveRoles);
    }

    return {
      ...user,
      roles: effectiveRoles,
      permissions,
      scopes,
    };
  }

  async register(req, res) {
    try {
      const { fullName, email, password } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.register({
        fullName,
        email,
        password,
      });

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, "User registered successfully", 201);
    } catch (error) {
      logger.error("Registration error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Registration failed",
      });
    }
  }

  async registerRetailer(req, res) {
    try {
      const { fullName, email, password, phone } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.registerRetailer({
        fullName,
        email,
        password,
        phone,
      });

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, result.message, 201);
    } catch (error) {
      logger.error("Retailer registration error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Retailer registration failed",
      });
    }
  }

  async sendRetailerOtp(req, res) {
    try {
      const { email, fullName, password, phone } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.sendRetailerOtp({ email, fullName, password, phone });

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Send retailer OTP error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to send OTP",
      });
    }
  }

  async verifyRetailerOtp(req, res) {
    try {
      const { email, otp } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.verifyRetailerOtp(email, otp);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, result.message, 201);
    } catch (error) {
      logger.error("Verify retailer OTP error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to verify OTP",
      });
    }
  }

  async verifyRetailer(req, res) {
    try {
      const { retailerId, action } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.verifyRetailer(retailerId, action);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      logger.error("Verify retailer error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Retailer verification failed",
      });
    }
  }

  async loginRetailer(req, res) {
    try {
      const { email, password } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.loginRetailer(email, password);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, "Retailer login successful", 200);
    } catch (error) {
      logger.error("Retailer login error:", error);
      const statusCode = error.message?.startsWith("Unauthorized:") ? 403 : 401;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Retailer login failed",
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password, loginAs } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.login(email, password, loginAs);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, "Login successful", 200);
    } catch (error) {
      logger.error("Login error:", error);
      const statusCode = error.message?.startsWith("Unauthorized:") ? 403 : 401;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Login failed",
      });
    }
  }

  async googleLogin(req, res) {
    try {
      const { token } = req.body;
      logger.info("Google login request received");

      if (!token) {
        logger.warn("Google login failed: No token provided");
        return res.status(400).json({
          success: false,
          message: "Token is required",
        });
      }

      const authSvc = this.authService || defaultAuthService;
      const result = await authSvc.googleLogin(token);
      logger.info(`Google login successful for user: ${result.user?.email}`);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, "Google login successful", 200);
    } catch (error) {
      logger.error("Google login error:", error);
      res.status(401).json({
        success: false,
        message: error.message || "Google login failed",
      });
    }
  }

  async appleLogin(req, res) {
    try {
      const { token } = req.body;
      logger.info("Apple login request received");

      if (!token) {
        logger.warn("Apple login failed: No token provided");
        return res.status(400).json({
          success: false,
          message: "Token is required",
        });
      }

      const authSvc = this.authService || defaultAuthService;
      const result = await authSvc.appleLogin(token);
      logger.info(`Apple login successful for user: ${result.user?.email}`);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, "Apple login successful", 200);
    } catch (error) {
      logger.error("Apple login error:", error);
      res.status(401).json({
        success: false,
        message: error.message || "Apple login failed",
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.refreshToken(refreshToken);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, "Token refreshed successfully", 200);
    } catch (error) {
      logger.error("Token refresh error:", error);
      res.status(401).json({
        success: false,
        message: error.message || "Token refresh failed",
      });
    }
  }

  async logout(req, res) {
    try {
      const userId = req.user?.id;
      const { refreshToken } = req.body;
      const authSvc = this.authService || defaultAuthService;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const result = await authSvc.logout(userId, refreshToken);

      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Logout error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Logout failed",
      });
    }
  }

  async deleteAccount(req, res) {
    try {
      const userId = req.user?.id;
      const authSvc = this.authService || defaultAuthService;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const result = await authSvc.deleteAccount(userId);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Delete account error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Account deletion failed",
      });
    }
  }

  async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.requestPasswordReset(email);

      res.status(200).json({
        success: true,
        message: result.message,
        ...(process.env.NODE_ENV === "development" &&
          result.resetToken && {
          resetToken: result.resetToken,
        }),
      });
    } catch (error) {
      logger.error("Password reset request error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Password reset request failed",
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { resetToken, newPassword } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.resetPassword(resetToken, newPassword);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Password reset error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Password reset failed",
      });
    }
  }

  /**
   * Handles GET /api/v1/auth/me
   * Returns user profile augmented with live roles from admin_user_roles and resolved permissions array.
   */
  async getProfile(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      let user = req.user;

      // Try to get enhanced profile data from UserService if available
      try {
        if (this.userService) {
          user = await this.userService.getProfile(userId);
        } else {
          const { createDependencies } = await import("../config/dependencies.js");
          const deps = await createDependencies();
          if (deps.userService) {
            user = await deps.userService.getProfile(userId);
          }
          if (!this.accessService && deps.accessService) {
            this.accessService = deps.accessService;
          }
        }
      } catch (error) {
        logger.warn(
          "Failed to get enhanced profile, using basic user data:",
          error.message
        );
      }

      // Attach evaluated roles & permissions from admin_user_roles table
      const userWithPermissions = await this._attachPermissions(user);

      res.status(200).json({
        success: true,
        data: { user: userWithPermissions },
        message: "Profile retrieved successfully",
      });
    } catch (error) {
      logger.error("Get profile error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get profile",
      });
    }
  }

  /**
   * Returns evaluated permissions, roles, and scopes for current authenticated user
   * GET /api/v1/auth/permissions
   */
  async getPermissions(req, res) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const userWithPermissions = await this._attachPermissions(user);

      res.status(200).json({
        success: true,
        data: {
          roles: userWithPermissions.roles || [],
          permissions: userWithPermissions.permissions || [],
          scopes: userWithPermissions.scopes || [],
        },
        message: "Permissions retrieved successfully",
      });
    } catch (error) {
      logger.error("Get permissions error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get permissions",
      });
    }
  }

  async verifyToken(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const token =
        authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.substring(7)
          : null;

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "No token provided",
        });
      }

      const authSvc = this.authService || defaultAuthService;
      const result = await authSvc.verifyToken(token);

      if (!result.valid) {
        return res.status(401).json({
          success: false,
          message: result.error || "Invalid token",
        });
      }

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      res.status(200).json({
        success: true,
        message: "Token is valid",
        data: { user: result.user },
      });
    } catch (error) {
      logger.error("Token verification error:", error);
      res.status(401).json({
        success: false,
        message: "Token verification failed",
      });
    }
  }

  async sendOtp(req, res) {
    try {
      const { email, fullName, password } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.sendOtp({ email, fullName, password });

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Send OTP error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to send OTP",
      });
    }
  }

  async verifyOtp(req, res) {
    try {
      const { email, otp } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.verifyOtp(email, otp);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, result.message, 200);
    } catch (error) {
      logger.error("Verify OTP error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to verify OTP",
      });
    }
  }

  async registerDeliveryPartner(req, res) {
    try {
      const authSvc = this.authService || defaultAuthService;
      const result = await authSvc.registerDeliveryPartner(req.body, req.files);

      res.status(201).json({
        success: true,
        message: "Application submitted for Admin review.",
        data: result,
      });
    } catch (error) {
      logger.error("Delivery partner registration error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Delivery partner registration failed",
      });
    }
  }

  async approveDeliveryPartner(req, res) {
    try {
      const { id } = req.params;
      const { isCodEligible } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.approveDeliveryPartner(id, isCodEligible);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Approve delivery partner error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Delivery partner approval failed",
      });
    }
  }

  async getPendingDeliveryPartnersList(req, res) {
    try {
      const userSvc = this.userService;
      let result;

      if (userSvc) {
        result = await userSvc.getPendingDeliveryPartners(req.query);
      } else {
        const { createDependencies } = await import("../config/dependencies.js");
        const deps = await createDependencies();
        result = await deps.userService.getPendingDeliveryPartners(req.query);
      }

      res.status(200).json({
        success: true,
        data: result,
        message: "Pending delivery partners retrieved successfully",
      });
    } catch (error) {
      logger.error("Get pending delivery partners error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch pending delivery partners",
      });
    }
  }

  async loginDeliveryPartner(req, res) {
    try {
      const { phone, pin } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.loginDeliveryPartner(phone, pin);

      if (result.user) {
        result.user = await this._attachPermissions(result.user);
      }

      sendTokenResponse(res, result, "Delivery partner login successful", 200);
    } catch (error) {
      logger.error("Delivery partner login error:", error);
      const statusCode =
        error.message?.includes("Invalid credentials") ||
        error.message?.includes("pending")
          ? 401
          : 403;

      res.status(statusCode).json({
        success: false,
        message: error.message || "Delivery partner login failed",
      });
    }
  }

  async resendDeliveryPartnerPin(req, res) {
    try {
      const { phone } = req.body;
      const authSvc = this.authService || defaultAuthService;

      const result = await authSvc.resendDeliveryPartnerPin(phone);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      logger.error("Resend delivery partner PIN error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to resend PIN",
      });
    }
  }
}

const authController = new AuthController();
export default authController;
