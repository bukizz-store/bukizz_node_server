import authService from "../services/authService.js";
import { logger } from "../utils/logger.js";

export class AuthController {
  async register(req, res) {
    try {
      const { fullName, email, password } = req.body;

      const result = await authService.register({
        fullName,
        email,
        password,
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: result,
      });
    } catch (error) {
      logger.error("Registration error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Registration failed",
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      const result = await authService.login(email, password);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      logger.error("Login error:", error);
      res.status(401).json({
        success: false,
        message: error.message || "Login failed",
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      const result = await authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: result,
      });
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

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const result = await authService.logout(userId, refreshToken);

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

  async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;

      const result = await authService.requestPasswordReset(email);

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

      const result = await authService.resetPassword(resetToken, newPassword);

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

  async getProfile(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      // Use UserService for comprehensive profile data if available
      let user = req.user;

      // Try to get enhanced profile data from UserService if available
      try {
        const { createDependencies } = await import(
          "../config/dependencies.js"
        );
        const { userService } = createDependencies();
        user = await userService.getProfile(userId);
      } catch (error) {
        // Fallback to basic user data from token if UserService fails
        logger.warn(
          "Failed to get enhanced profile, using basic user data:",
          error.message
        );
      }

      res.status(200).json({
        success: true,
        data: { user },
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

      const result = await authService.verifyToken(token);

      if (!result.valid) {
        return res.status(401).json({
          success: false,
          message: result.error || "Invalid token",
        });
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
}

const authController = new AuthController();
export default authController;
