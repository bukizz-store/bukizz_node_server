import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger.js";
import emailService from "./emailService.js";
import OtpRepository from "../repositories/otpRepository.js";

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
    let { fullName, email, password } = userData;
    if (email) email = email.toLowerCase();

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
        .ilike("email", email)
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

  async registerRetailer(userData) {
    let { fullName, email, password, phone } = userData;
    if (email) email = email.toLowerCase();

    try {
      // Validate input
      if (!fullName || !email || !password) {
        throw new Error("Full name, email, and password are required");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }

      // Check if user already exists
      const { data: existingUser } = await this.supabase
        .from("users")
        .select("id")
        .ilike("email", email)
        .single();

      if (existingUser) {
        throw new Error("User already exists with this email");
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user record with role=retailer and deactivation_reason=unauthorized
      const userId = uuidv4();
      const { error: userError } = await this.supabase.from("users").insert({
        id: userId,
        full_name: fullName,
        email: email,
        phone: phone || null,
        email_verified: false,
        is_active: false,
        role: "retailer",
        deactivation_reason: "unauthorized",
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

      // Get user data (do NOT generate tokens — account is not yet approved)
      const { data: newUser, error: fetchError } = await this.supabase
        .from("users")
        .select(
          "id, full_name, email, email_verified, phone, is_active, role, deactivation_reason, created_at"
        )
        .eq("id", userId)
        .single();

      if (fetchError) throw fetchError;

      return {
        user: newUser,
        message: "Retailer registered successfully. Account is pending admin approval.",
      };
    } catch (error) {
      logger.error("Retailer registration error:", error);
      throw error;
    }
  }

  async verifyRetailer(retailerId, action) {
    try {
      if (!retailerId) {
        throw new Error("Retailer ID is required");
      }

      // Fetch the retailer user
      const { data: user, error: fetchError } = await this.supabase
        .from("users")
        .select("id, full_name, email, role, is_active, deactivation_reason")
        .eq("id", retailerId)
        .single();

      if (fetchError || !user) {
        throw new Error("Retailer not found");
      }

      if (user.role !== "retailer") {
        throw new Error("User is not a retailer");
      }

      let updateData;
      let message;

      if (action === "authorize") {
        updateData = {
          is_active: true,
          deactivation_reason: "authorized",
          updated_at: new Date().toISOString(),
        };
        message = `Retailer '${user.full_name}' has been authorized successfully.`;
      } else if (action === "deauthorize") {
        updateData = {
          is_active: false,
          deactivation_reason: "unauthorized",
          updated_at: new Date().toISOString(),
        };
        message = `Retailer '${user.full_name}' has been deauthorized.`;
      } else {
        throw new Error("Invalid action. Use 'authorize' or 'deauthorize'.");
      }

      const { data: updatedUser, error: updateError } = await this.supabase
        .from("users")
        .update(updateData)
        .eq("id", retailerId)
        .select("id, full_name, email, role, is_active, deactivation_reason, updated_at")
        .single();

      if (updateError) throw updateError;

      return {
        user: updatedUser,
        message,
      };
    } catch (error) {
      logger.error("Verify retailer error:", error);
      throw error;
    }
  }

  async loginRetailer(email, password) {
    try {
      if (email) email = email.toLowerCase();

      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      // Get user and auth data
      const { data: users, error: userError } = await this.supabase
        .from("users")
        .select(
          `
          id, full_name, email, email_verified, phone, is_active, role, deactivation_reason,
          user_auths!inner(password_hash)
        `
        )
        .ilike("email", email)
        .eq("user_auths.provider", "email");

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

      // Only check that the user is a retailer
      if (user.role !== "retailer") {
        throw new Error("Unauthorized: Retailer access required");
      }

      // Generate tokens — no is_active / deactivation_reason checks here
      const tokens = await this.generateTokens(user.id);

      // Clean response
      delete user.user_auths;

      return {
        user,
        ...tokens,
      };
    } catch (error) {
      logger.error("Retailer login error:", error);
      throw error;
    }
  }

  async login(email, password, loginAs = "customer") {
    try {
      if (email) email = email.toLowerCase();

      // Validate input
      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      // Get user and auth data with join (do NOT filter by is_active here — we check it manually)
      const { data: users, error: userError } = await this.supabase
        .from("users")
        .select(
          `
          id, full_name, email, email_verified, phone, is_active, role, deactivation_reason,
          user_auths!inner(password_hash)
        `
        )
        .ilike("email", email)
        .eq("user_auths.provider", "email");

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

      // Role-based login enforcement (strict matching)
      const userRole = user.role || "customer";
      if (loginAs === "admin" && userRole !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      if (loginAs === "retailer" && userRole !== "retailer") {
        throw new Error("Unauthorized: Retailer access required");
      }

      // Retailer authorization check
      if (userRole === "retailer") {
        if (!user.is_active && user.deactivation_reason === "unauthorized") {
          throw new Error("Unauthorized: Your account is pending admin approval. Please contact the admin.");
        }
        if (!user.is_active) {
          throw new Error("Unauthorized: Your account has been deactivated. Please contact the admin.");
        }
      } else {
        // For non-retailer users, still check is_active
        if (!user.is_active) {
          throw new Error("Your account is inactive. Please contact support.");
        }
      }

      // Generate tokens
      const tokens = await this.generateTokens(user.id);

      // Remove internal fields from user object
      delete user.user_auths;
      delete user.deactivation_reason;

      return {
        user,
        ...tokens,
      };
    } catch (error) {
      logger.error("Login error:", error);
      throw error;
    }
  }

  async googleLogin(token) {
    try {
      logger.info("Verifying Google token with Supabase");
      // Verify the token with Supabase Auth
      const { data: { user: supabaseUser }, error: verifyError } = await this.supabase.auth.getUser(token);

      if (verifyError || !supabaseUser) {
        logger.error("Google token verification failed:", verifyError);
        throw new Error("Invalid Google token");
      }

      let email = supabaseUser.email;
      if (email) email = email.toLowerCase();
      logger.info(`Google token verified for email: ${email}`);
      const fullName = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || email.split('@')[0];

      // Check if user already exists in our users table
      const { data: existingUser, error: checkError } = await this.supabase
        .from("users")
        .select("id, full_name, email, email_verified, phone, is_active, role")
        .ilike("email", email)
        .single();

      let userId;
      let user;

      if (existingUser) {
        logger.info(`Existing user found for email: ${email}`);
        userId = existingUser.id;
        user = existingUser;

        // Update email_verified if it's not verified (since Google verified it)
        if (!existingUser.email_verified) {
          logger.info(`Updating email verification status for user: ${userId}`);
          await this.supabase
            .from("users")
            .update({ email_verified: true, updated_at: new Date().toISOString() })
            .eq("id", userId);
          user.email_verified = true;
        }

        // Ensure user_auth record exists for google provider
        const { data: existingAuth } = await this.supabase
          .from("user_auths")
          .select("id")
          .eq("user_id", userId)
          .eq("provider", "google")
          .single();

        if (!existingAuth) {
          logger.info(`Creating google auth record for existing user: ${userId}`);
          await this.supabase
            .from("user_auths")
            .insert({
              id: uuidv4(),
              user_id: userId,
              provider: "google",
              provider_user_id: supabaseUser.id,
              created_at: new Date().toISOString(),
            });
        }

      } else {
        logger.info(`Creating new user for email: ${email}`);
        // Create new user
        userId = uuidv4();

        const { error: userError } = await this.supabase.from("users").insert({
          id: userId,
          full_name: fullName,
          email: email,
          email_verified: true, // Trusted from Google
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (userError) {
          logger.error("Failed to create new user:", userError);
          throw userError;
        }

        // Create user_auth record
        const { error: authError } = await this.supabase
          .from("user_auths")
          .insert({
            id: uuidv4(),
            user_id: userId,
            provider: "google",
            provider_user_id: supabaseUser.id,
            created_at: new Date().toISOString(),
          });

        if (authError) {
          logger.error("Failed to create auth record for new user:", authError);
          throw authError;
        }

        user = {
          id: userId,
          full_name: fullName,
          email: email,
          email_verified: true,
          is_active: true
        };
        logger.info(`New user created successfully: ${userId}`);
      }

      if (!user.is_active) {
        logger.warn(`Inactive user attempted login: ${email}`);
        throw new Error("User account is inactive");
      }

      // Generate tokens
      logger.info(`Generating tokens for user: ${userId}`);
      const tokens = await this.generateTokens(userId);

      return {
        user,
        ...tokens,
      };

    } catch (error) {
      logger.error("Google login service error:", error);
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

      // First, try to find a non-revoked token (normal path)
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

      if (!error && tokens) {
        // Normal path: token is valid and not revoked
        if (new Date() > new Date(tokens.expires_at)) {
          throw new Error("Refresh token expired");
        }

        if (!tokens.users.is_active) {
          throw new Error("User account is inactive");
        }

        // Revoke old token (rotation)
        await this.supabase
          .from("refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", tokens.id);

        // Generate new tokens
        return await this.generateTokens(tokens.user_id, tokens.device_info);
      }

      // Grace period path: token may have been recently revoked by a concurrent request
      // This handles the race condition where multiple tabs/requests try to refresh simultaneously
      const GRACE_PERIOD_MS = 30 * 1000; // 30 seconds
      const graceCutoff = new Date(Date.now() - GRACE_PERIOD_MS).toISOString();

      const { data: revokedToken, error: revokedError } = await this.supabase
        .from("refresh_tokens")
        .select(
          `
          id, user_id, device_info, expires_at, revoked_at,
          users!inner(is_active)
        `
        )
        .eq("token_hash", tokenHash)
        .not("revoked_at", "is", null)
        .gte("revoked_at", graceCutoff)
        .single();

      if (revokedError || !revokedToken) {
        throw new Error("Invalid refresh token");
      }

      // Token was recently revoked — likely a race condition
      logger.info(`Refresh token reuse detected within grace period for user ${revokedToken.user_id}`);

      if (new Date() > new Date(revokedToken.expires_at)) {
        throw new Error("Refresh token expired");
      }

      if (!revokedToken.users.is_active) {
        throw new Error("User account is inactive");
      }

      // Generate new tokens for the user (don't revoke any more — the rotation already happened)
      return await this.generateTokens(revokedToken.user_id, revokedToken.device_info);
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
      if (email) email = email.toLowerCase();

      if (!email) {
        throw new Error("Email is required");
      }

      // Check if user exists
      const { data: users, error } = await this.supabase
        .from("users")
        .select("id, full_name")
        .ilike("email", email)
        .eq("is_active", true);

      if (error || !users || users.length === 0) {
        // Don't reveal if email exists or not for security
        return { message: "If the email exists, a reset link has been sent" };
      }

      const userId = users[0].id;
      const firstName = users[0].full_name.split(' ')[0];

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
        `Password reset requested for user ${userId}`
      );

      // Send forgot password email
      await emailService.sendForgotPasswordEmail(email, resetToken, firstName);

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

      // Check if user still exists (do NOT filter by is_active here —
      // retailers may be inactive but still need access to onboarding routes)
      const { data: users, error } = await this.supabase
        .from("users")
        .select("id, full_name, email, email_verified, phone, is_active, role, deactivation_reason")
        .eq("id", decoded.userId);

      if (error || !users || users.length === 0) {
        throw new Error("User not found");
      }

      const user = users[0];

      // Block truly deactivated non-retailer users
      if (!user.is_active && user.role !== "retailer") {
        throw new Error("User account is inactive");
      }

      // Map role to roles array for middleware compatibility
      user.roles = user.role ? [user.role] : [];

      return {
        valid: true,
        user,
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

  async generateVerificationToken(userId) {
    try {
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");

      // Token expires in 24 hours
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { error } = await this.supabase
        .from("users")
        .update({
          verification_token: tokenHash, // Store hash for security
          verification_token_expiry: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      return verificationToken;
    } catch (error) {
      logger.error("Verification token generation error:", error);
      throw error;
    }
  }

  async sendOtp(userData) {
    let { email, fullName, password } = userData;
    if (email) email = email.toLowerCase();
    try {
      if (!email) {
        throw new Error("Email is required");
      }

      // Check if user already exists in main users table
      const { data: existingUser, error } = await this.supabase
        .from("users")
        .select("id")
        .ilike("email", email)
        .single();

      if (existingUser) {
        throw new Error("User already exists with this email");
      }

      // Generate 6-digit OTP use secure random
      const otp = crypto.randomInt(100000, 999999).toString();

      // Hash password if provided (for new registration)
      let passwordHash = null;
      if (password) {
        const saltRounds = 12;
        passwordHash = await bcrypt.hash(password, saltRounds);
      }

      const metadata = {
        fullName,
        passwordHash,
        // Add other fields if needed
      };

      // Use OtpRepository to upsert OTP
      const otpRepository = new OtpRepository(this.supabase);
      await otpRepository.upsertOtp(email, otp, metadata);

      // Send OTP via EmailService
      await emailService.sendOtpEmail(email, otp);

      return { message: "OTP sent successfully" };
    } catch (error) {
      logger.error("Send OTP error:", error);
      throw error;
    }
  }

  async verifyOtp(email, otp) {
    try {
      if (email) email = email.toLowerCase();

      if (!email || !otp) {
        throw new Error("Email and OTP are required");
      }

      const otpRepository = new OtpRepository(this.supabase);
      const otpRecord = await otpRepository.findByEmail(email);

      if (!otpRecord) {
        throw new Error("Invalid or expired OTP");
      }

      if (otpRecord.otp !== otp) {
        throw new Error("Invalid OTP");
      }

      // Check expiration (10 minutes)
      const otpCreatedTime = new Date(otpRecord.created_at).getTime();
      const currentTime = new Date().getTime();
      if (currentTime - otpCreatedTime > 10 * 60 * 1000) {
        throw new Error("OTP Expired");
      }

      // Metadata contains user info
      const { fullName, passwordHash } = otpRecord.metadata;

      // Create user in users table
      const userId = uuidv4();
      const { error: userError } = await this.supabase.from("users").insert({
        id: userId,
        full_name: fullName || "User", // Default if missing
        email: email,
        email_verified: true,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (userError) throw userError;

      // Create user_auth record IF password exists
      if (passwordHash) {
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
      }

      // Delete from otp_verifications
      await otpRepository.deleteByEmail(email);

      // Generate tokens
      const tokens = await this.generateTokens(userId);

      // Get complete user data
      const { data: newUser } = await this.supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      return {
        message: "OTP verified successfully",
        user: newUser,
        ...tokens
      };
    } catch (error) {
      logger.error("Verify OTP error:", error);
      throw error;
    }
  }

  async sendRetailerOtp(userData) {
    let { email, fullName, password, phone } = userData;
    if (email) email = email.toLowerCase();
    try {
      if (!email || !fullName || !password) {
        throw new Error("Email, full name, and password are required");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }

      // Check if user already exists
      const { data: existingUser } = await this.supabase
        .from("users")
        .select("id")
        .ilike("email", email)
        .single();

      if (existingUser) {
        throw new Error("User already exists with this email");
      }

      // Generate 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();

      // Hash password for storage in metadata
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const metadata = {
        fullName,
        passwordHash,
        phone: phone || null,
        role: "retailer",
      };

      // Upsert OTP record
      const otpRepository = new OtpRepository(this.supabase);
      await otpRepository.upsertOtp(email, otp, metadata);

      // Send OTP via email
      await emailService.sendOtpEmail(email, otp);

      return { message: "OTP sent successfully to " + email };
    } catch (error) {
      logger.error("Send retailer OTP error:", error);
      throw error;
    }
  }

  async verifyRetailerOtp(email, otp) {
    try {
      if (email) email = email.toLowerCase();

      if (!email || !otp) {
        throw new Error("Email and OTP are required");
      }

      const otpRepository = new OtpRepository(this.supabase);
      const otpRecord = await otpRepository.findByEmail(email);

      if (!otpRecord) {
        throw new Error("Invalid or expired OTP");
      }

      if (otpRecord.otp !== otp) {
        throw new Error("Invalid OTP");
      }

      // Check expiration (10 minutes)
      const otpCreatedTime = new Date(otpRecord.created_at).getTime();
      const currentTime = Date.now();
      if (currentTime - otpCreatedTime > 10 * 60 * 1000) {
        throw new Error("OTP Expired");
      }

      const { fullName, passwordHash, phone } = otpRecord.metadata;

      // Create retailer user with is_active=false, deactivation_reason=unauthorized
      const userId = uuidv4();
      const { error: userError } = await this.supabase.from("users").insert({
        id: userId,
        full_name: fullName || "Retailer",
        email: email,
        phone: phone || null,
        email_verified: true,
        is_active: false,
        role: "retailer",
        deactivation_reason: "unauthorized",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (userError) throw userError;

      // Create user_auth record
      if (passwordHash) {
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
      }

      // Delete OTP record
      await otpRepository.deleteByEmail(email);

      // Generate tokens so retailer can access onboarding routes to submit profile data
      const tokens = await this.generateTokens(userId);

      const { data: newUser } = await this.supabase
        .from("users")
        .select("id, full_name, email, email_verified, phone, is_active, role, deactivation_reason, created_at")
        .eq("id", userId)
        .single();

      return {
        message: "Retailer registered successfully. Account is pending admin approval.",
        user: newUser,
        ...tokens,
      };
    } catch (error) {
      logger.error("Verify retailer OTP error:", error);
      throw error;
    }
  }
}

const authService = new AuthService(supabase);
export default authService;
