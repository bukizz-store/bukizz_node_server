import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger.js";

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class AuthService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.jwtSecret = process.env.JWT_SECRET || "your-secret-key";
    this.jwtExpiry = process.env.JWT_EXPIRY || "24h";
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || "7d";
  }

  async register(userData) {
    const { fullName, email, password } = userData;

    try {
      // Validate input
      if (!fullName || !email || !password) {
        throw new Error("Full name, email, and password are required");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }

      // Check if user already exists
      const { data: existingUser, error: checkError } = await this.supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

      if (existingUser) {
        throw new Error("User already exists with this email");
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user record in Supabase
      const userId = uuidv4();
      const { error: userError } = await this.supabase.from("users").insert({
        id: userId,
        full_name: fullName,
        email: email,
        email_verified: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (userError) throw userError;

      // Create user_auth record
      const { error: authError } = await this.supabase
        .from("user_auths")
        .insert({
          id: uuidv4(),
          user_id: userId,
          provider: "email",
          provider_user_id: email,
          password_hash: passwordHash,
          created_at: new Date().toISOString(),
        });

      if (authError) throw authError;

      // Generate tokens
      const tokens = await this.generateTokens(userId);

      // Get user data
      const { data: userData, error: fetchError } = await this.supabase
        .from("users")
        .select(
          "id, full_name, email, email_verified, phone, is_active, created_at"
        )
        .eq("id", userId)
        .single();

      if (fetchError) throw fetchError;

      return {
        user: userData,
        ...tokens,
      };
    } catch (error) {
      logger.error("Registration error:", error);
      throw error;
    }
  }

  async login(email, password) {
    try {
      // Validate input
      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      // Get user and auth data with join
      const { data: users, error: userError } = await this.supabase
        .from("users")
        .select(
          `
          id, full_name, email, email_verified, phone, is_active,
          user_auths!inner(password_hash)
        `
        )
        .eq("email", email)
        .eq("user_auths.provider", "email")
        .eq("is_active", true);

      if (userError || !users || users.length === 0) {
        throw new Error("Invalid credentials");
      }

      const user = users[0];
      const passwordHash = user.user_auths[0]?.password_hash;

      if (!passwordHash) {
        throw new Error("Invalid credentials");
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, passwordHash);
      if (!isValidPassword) {
        throw new Error("Invalid credentials");
      }

      // Generate tokens
      const tokens = await this.generateTokens(user.id);

      // Remove password_hash from user object
      delete user.user_auths;

      return {
        user,
        ...tokens,
      };
    } catch (error) {
      logger.error("Login error:", error);
      throw error;
    }
  }

  async generateTokens(userId, deviceInfo = null) {
    try {
      // Generate access token
      const accessToken = jwt.sign({ userId }, this.jwtSecret, {
        expiresIn: this.jwtExpiry,
      });

      // Generate refresh token
      const refreshToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      // Calculate expiry date
      const expiryMs = this.parseTimeToMs(this.refreshTokenExpiry);
      const expiresAt = new Date(Date.now() + expiryMs).toISOString();

      // Store refresh token in Supabase
      const { error } = await this.supabase.from("refresh_tokens").insert({
        id: uuidv4(),
        user_id: userId,
        token_hash: tokenHash,
        device_info: deviceInfo,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      return {
        accessToken,
        refreshToken,
        expiresIn: Math.floor(expiryMs / 1000),
      };
    } catch (error) {
      logger.error("Token generation error:", error);
      throw error;
    }
  }

  async refreshToken(refreshToken) {
    try {
      if (!refreshToken) {
        throw new Error("Refresh token is required");
      }

      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      const { data: tokens, error } = await this.supabase
        .from("refresh_tokens")
        .select(
          `
          id, user_id, device_info, expires_at, revoked_at,
          users!inner(is_active)
        `
        )
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .single();

      if (error || !tokens) {
        throw new Error("Invalid refresh token");
      }

      // Check if token is expired
      if (new Date() > new Date(tokens.expires_at)) {
        throw new Error("Refresh token expired");
      }

      // Check if user is active
      if (!tokens.users.is_active) {
        throw new Error("User account is inactive");
      }

      // Revoke old token
      await this.supabase
        .from("refresh_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", tokens.id);

      // Generate new tokens
      return await this.generateTokens(tokens.user_id, tokens.device_info);
    } catch (error) {
      logger.error("Token refresh error:", error);
      throw error;
    }
  }

  async logout(userId, refreshToken = null) {
    try {
      if (refreshToken) {
        const tokenHash = crypto
          .createHash("sha256")
          .update(refreshToken)
          .digest("hex");
        await this.supabase
          .from("refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("token_hash", tokenHash);
      } else {
        // Revoke all refresh tokens for user
        await this.supabase
          .from("refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userId)
          .is("revoked_at", null);
      }

      return { message: "Logged out successfully" };
    } catch (error) {
      logger.error("Logout error:", error);
      throw error;
    }
  }

  async requestPasswordReset(email) {
    try {
      if (!email) {
        throw new Error("Email is required");
      }

      // Check if user exists
      const { data: users, error } = await this.supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .eq("is_active", true);

      if (error || !users || users.length === 0) {
        // Don't reveal if email exists or not for security
        return { message: "If the email exists, a reset link has been sent" };
      }

      const userId = users[0].id;

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Store reset token
      await this.supabase.from("password_resets").insert({
        id: uuidv4(),
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      });

      logger.info(
        `Password reset requested for user ${userId}, token: ${resetToken}`
      );

      return {
        message: "If the email exists, a reset link has been sent",
        // In development, return the token for testing
        ...(process.env.NODE_ENV === "development" && { resetToken }),
      };
    } catch (error) {
      logger.error("Password reset request error:", error);
      throw error;
    }
  }

  async resetPassword(resetToken, newPassword) {
    try {
      if (!resetToken || !newPassword) {
        throw new Error("Reset token and new password are required");
      }

      if (newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }

      const tokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      const { data: resets, error } = await this.supabase
        .from("password_resets")
        .select(
          `
          id, user_id, expires_at, used_at,
          users!inner(is_active)
        `
        )
        .eq("token_hash", tokenHash)
        .is("used_at", null)
        .single();

      if (error || !resets) {
        throw new Error("Invalid or expired reset token");
      }

      // Check if token is expired
      if (new Date() > new Date(resets.expires_at)) {
        throw new Error("Reset token has expired");
      }

      // Check if user is active
      if (!resets.users.is_active) {
        throw new Error("User account is inactive");
      }

      // Hash new password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      const { error: updateError } = await this.supabase
        .from("user_auths")
        .update({
          password_hash: passwordHash,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", resets.user_id)
        .eq("provider", "email");

      if (updateError) throw updateError;

      // Mark reset token as used
      await this.supabase
        .from("password_resets")
        .update({ used_at: new Date().toISOString() })
        .eq("id", resets.id);

      // Revoke all refresh tokens for security
      await this.supabase
        .from("refresh_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", resets.user_id)
        .is("revoked_at", null);

      return { message: "Password reset successfully" };
    } catch (error) {
      logger.error("Password reset error:", error);
      throw error;
    }
  }

  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);

      // Check if user still exists and is active
      const { data: users, error } = await this.supabase
        .from("users")
        .select("id, full_name, email, email_verified, phone, is_active")
        .eq("id", decoded.userId)
        .eq("is_active", true);

      if (error || !users || users.length === 0) {
        throw new Error("User not found or inactive");
      }

      return {
        valid: true,
        user: users[0],
        decoded,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  parseTimeToMs(timeStr) {
    const units = {
      s: 1000,
      m: 1000 * 60,
      h: 1000 * 60 * 60,
      d: 1000 * 60 * 60 * 24,
    };

    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error("Invalid time format");
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }
}

const authService = new AuthService(supabase);
export default authService;
