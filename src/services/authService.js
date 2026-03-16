import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger.js";
import { queueForgotPasswordEmail, queueOtpEmail } from "../queue/emailQueue.js";
import OtpRepository from "../repositories/otpRepository.js";
import { imageService } from "./imageService.js";
import { emailService } from "./emailService.js";

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

  normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  async _uploadDeliveryPartnerFiles(files = {}, userId) {
    const bucket = "delivery-partner-docs";
    const baseFolder = `delivery-partners/${userId}`;

    const uploadField = async (fieldName, folderName) => {
      const file = files?.[fieldName]?.[0];
      if (!file) return null;

      if (!file.mimetype?.startsWith("image/")) {
        throw new Error(`Invalid file type for ${fieldName}. Only images are allowed.`);
      }

      const result = await imageService.uploadImage(
        file,
        bucket,
        `${baseFolder}/${folderName}`,
      );
      return result.url;
    };

    const profilePhotoUrl =
      (await uploadField("profilePhoto", "profile")) ||
      (await uploadField("profile_photo", "profile"));

    const aadhaarFrontPhotoUrl =
      (await uploadField("aadhaarFrontPhoto", "documents")) ||
      (await uploadField("aadhaarPhoto", "documents")) ||
      (await uploadField("aadhaar_front_photo", "documents"));

    const aadhaarBackPhotoUrl =
      (await uploadField("aadhaarBackPhoto", "documents")) ||
      (await uploadField("aadhaar_back_photo", "documents"));

    const panPhotoUrl =
      (await uploadField("panPhoto", "documents")) ||
      (await uploadField("pan_photo", "documents"));

    const drivingLicensePhotoUrl =
      (await uploadField("drivingLicensePhoto", "documents")) ||
      (await uploadField("dlPhoto", "documents")) ||
      (await uploadField("driving_license_photo", "documents")) ||
      (await uploadField("dl_photo", "documents"));

    return {
      profilePhotoUrl,
      aadhaarFrontPhotoUrl,
      aadhaarBackPhotoUrl,
      panPhotoUrl,
      drivingLicensePhotoUrl,
    };
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

  async appleLogin(token) {
    try {
      logger.info("Verifying Apple token with Supabase");
      // Verify the token with Supabase Auth
      const { data: { user: supabaseUser }, error: verifyError } = await this.supabase.auth.getUser(token);

      if (verifyError || !supabaseUser) {
        logger.error("Apple token verification failed:", verifyError);
        throw new Error("Invalid Apple token");
      }

      let email = supabaseUser.email;
      if (email) email = email.toLowerCase();
      logger.info(`Apple token verified for email: ${email}`);
      const fullName = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || (email ? email.split('@')[0] : 'Apple User');

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

        // Update email_verified if it's not verified (since Apple verified it)
        if (!existingUser.email_verified) {
          logger.info(`Updating email verification status for user: ${userId}`);
          await this.supabase
            .from("users")
            .update({ email_verified: true, updated_at: new Date().toISOString() })
            .eq("id", userId);
          user.email_verified = true;
        }

        // Ensure user_auth record exists for apple provider
        const { data: existingAuth } = await this.supabase
          .from("user_auths")
          .select("id")
          .eq("user_id", userId)
          .eq("provider", "apple")
          .single();

        if (!existingAuth) {
          logger.info(`Creating apple auth record for existing user: ${userId}`);
          await this.supabase
            .from("user_auths")
            .insert({
              id: uuidv4(),
              user_id: userId,
              provider: "apple",
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
          email_verified: true, // Trusted from Apple
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
            provider: "apple",
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
      logger.error("Apple login service error:", error);
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

      // Send forgot password email via queue (with retries)
      await queueForgotPasswordEmail(email, resetToken, firstName);

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
      if (
        !user.is_active &&
        user.role !== "retailer" &&
        user.role !== "delivery_partner"
      ) {
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

      // Send OTP via email queue (with retries)
      await queueOtpEmail(email, otp);

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

      // Send OTP via email queue (with retries)
      await queueOtpEmail(email, otp);

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

  async registerDeliveryPartner(payload, files = {}) {
    let {
      fullName,
      name,
      phone,
      email,
      profilePhotoUrl,
      profile_photo_url,
      vehicleDetails,
      vehicle_details,
      documents,
      docs,
    } = payload;

    fullName = fullName || name;
    profilePhotoUrl = profilePhotoUrl || profile_photo_url;
    vehicleDetails = vehicleDetails || vehicle_details;
    documents = documents || docs;

    if (email) email = email.toLowerCase();
    phone = this.normalizePhone(phone);

    try {
      if (!fullName || !phone || !email || !vehicleDetails || !documents) {
        throw new Error("Full name, phone, email, vehicleDetails, and documents are required");
      }

      const aadhaarNumber = documents.aadhaarNumber || documents.aadharNumber;
      const drivingLicenseNumber =
        documents.drivingLicenseNumber || documents.dlNumber;

      if ((!aadhaarNumber && !documents.panNumber) || !drivingLicenseNumber) {
        throw new Error(
          "Aadhaar or PAN number, and driving license number are required",
        );
      }

      const { data: existingByEmail } = await this.supabase
        .from("users")
        .select("id")
        .ilike("email", email)
        .limit(1);

      if (existingByEmail && existingByEmail.length > 0) {
        throw new Error("User already exists with this email");
      }

      const { data: existingByPhone } = await this.supabase
        .from("users")
        .select("id")
        .eq("phone", phone)
        .limit(1);

      if (existingByPhone && existingByPhone.length > 0) {
        throw new Error("User already exists with this phone number");
      }

      const userId = uuidv4();
      const uploadedUrls = await this._uploadDeliveryPartnerFiles(files, userId);

      const finalProfilePhotoUrl =
        uploadedUrls.profilePhotoUrl || profilePhotoUrl || null;
      const finalAadhaarFrontPhotoUrl =
        uploadedUrls.aadhaarFrontPhotoUrl ||
        documents.aadhaarPhotoUrl ||
        documents.aadhaarFrontPhotoUrl ||
        null;
      const finalAadhaarBackPhotoUrl =
        uploadedUrls.aadhaarBackPhotoUrl ||
        documents.aadhaarBackPhotoUrl ||
        null;
      const finalPanPhotoUrl =
        uploadedUrls.panPhotoUrl || documents.panPhotoUrl || null;
      const finalDrivingLicensePhotoUrl =
        uploadedUrls.drivingLicensePhotoUrl ||
        documents.drivingLicensePhotoUrl ||
        documents.dlPhotoUrl ||
        null;

      // Validate required photos based on provided data
      if (!finalProfilePhotoUrl) throw new Error("Profile photo is required");
      if (!finalDrivingLicensePhotoUrl)
        throw new Error("Driving license photo is required");

      if (aadhaarNumber) {
        if (!finalAadhaarFrontPhotoUrl || !finalAadhaarBackPhotoUrl) {
          throw new Error("Both Aadhaar front and back photos are required");
        }
      } else if (documents.panNumber) {
        if (!finalPanPhotoUrl) throw new Error("PAN card photo is required");
      }

      const { error: userError } = await this.supabase.from("users").insert({
        id: userId,
        full_name: fullName,
        phone,
        email,
        role: "delivery_partner",
        is_active: false,
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (userError) throw userError;

      const deliveryPartnerData = {
        aadhaarNumber: aadhaarNumber || null,
        panNumber: documents.panNumber || null,
        drivingLicenseNumber,
        aadhaarPhotoUrl: finalAadhaarFrontPhotoUrl || null,
        aadhaarBackPhotoUrl: finalAadhaarBackPhotoUrl || null,
        panPhotoUrl: finalPanPhotoUrl || null,
        drivingLicensePhotoUrl: finalDrivingLicensePhotoUrl,
      };

      const { error: dpError } = await this.supabase
        .from("delivery_partner_data")
        .insert({
          user_id: userId,
          profile_photo_url: finalProfilePhotoUrl,
          vehicle_details: {
            type: vehicleDetails.type,
            registrationNumber:
              vehicleDetails.registrationNumber ||
              vehicleDetails.registration_number,
          },
          documents: deliveryPartnerData,
          kyc_status: "pending",
          is_cod_eligible: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (dpError) throw dpError;

      return {
        success: true,
        message: "Application submitted for Admin review.",
      };
    } catch (error) {
      logger.error("Delivery partner registration error:", error);
      throw error;
    }
  }

  async approveDeliveryPartner(deliveryPartnerId, isCodEligible = false) {
    try {
      if (!deliveryPartnerId) {
        throw new Error("Delivery partner ID is required");
      }

      const { data: user, error: userError } = await this.supabase
        .from("users")
        .select("id, full_name, email, phone, role, is_active")
        .eq("id", deliveryPartnerId)
        .single();

      if (userError || !user) {
        throw new Error("Delivery partner not found");
      }

      if (user.role !== "delivery_partner") {
        throw new Error("User is not a delivery partner");
      }

      const { data: partnerData, error: partnerDataError } = await this.supabase
        .from("delivery_partner_data")
        .select("user_id, kyc_status")
        .eq("user_id", deliveryPartnerId)
        .single();

      if (partnerDataError || !partnerData) {
        throw new Error("Delivery partner profile data not found");
      }

      const { error: dpUpdateError } = await this.supabase
        .from("delivery_partner_data")
        .update({
          kyc_status: "verified",
          is_cod_eligible: !!isCodEligible,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", deliveryPartnerId);

      if (dpUpdateError) throw dpUpdateError;

      const { error: userUpdateError } = await this.supabase
        .from("users")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryPartnerId);

      if (userUpdateError) throw userUpdateError;

      const pin = crypto.randomInt(1000, 10000).toString();
      const pinHash = await bcrypt.hash(pin, 12);

      const { data: existingPinAuthRows } = await this.supabase
        .from("user_auths")
        .select("id")
        .eq("user_id", deliveryPartnerId)
        .eq("provider", "dp_pin")
        .limit(1);

      const existingPinAuth = existingPinAuthRows?.[0] || null;

      if (existingPinAuth?.id) {
        const { error: updatePinError } = await this.supabase
          .from("user_auths")
          .update({
            provider_user_id: this.normalizePhone(user.phone),
            password_hash: pinHash,
          })
          .eq("id", existingPinAuth.id);

        if (updatePinError) throw updatePinError;
      } else {
        const { error: createPinError } = await this.supabase
          .from("user_auths")
          .insert({
            id: uuidv4(),
            user_id: deliveryPartnerId,
            provider: "dp_pin",
            provider_user_id: this.normalizePhone(user.phone),
            password_hash: pinHash,
            created_at: new Date().toISOString(),
          });

        if (createPinError) throw createPinError;
      }

      if (!user.email) {
        throw new Error("Delivery partner email is missing. Cannot send PIN email.");
      }

      const emailResult = await emailService.sendDeliveryPartnerWelcomeEmail(
        user.email,
        user.full_name,
        user.phone,
        pin,
      );

      const pinSent = !emailResult?.error;

      return {
        message: "Delivery partner approved successfully.",
        data: {
          userId: deliveryPartnerId,
          kycStatus: "verified",
          isCodEligible: !!isCodEligible,
          pinSent: pinSent,
          emailError: emailResult?.error || null,
        },
      };
    } catch (error) {
      logger.error("Approve delivery partner error:", error);
      throw error;
    }
  }

  async resendDeliveryPartnerPin(phone) {
    try {
      const normalizedPhone = this.normalizePhone(phone);

      if (!normalizedPhone) {
        throw new Error("Phone number is required");
      }

      const { data: user, error: userError } = await this.supabase
        .from("users")
        .select("id, full_name, email, phone, is_active, role")
        .eq("phone", normalizedPhone)
        .eq("role", "delivery_partner")
        .single();

      if (userError || !user) {
        throw new Error("Delivery partner not found with this phone number");
      }

      const { data: partnerData, error: partnerError } = await this.supabase
        .from("delivery_partner_data")
        .select("kyc_status")
        .eq("user_id", user.id)
        .single();

      if (partnerError || !partnerData) {
        throw new Error("Delivery partner profile not found");
      }

      if (partnerData.kyc_status !== "verified") {
        throw new Error("Your account is not yet approved. Please wait for admin approval.");
      }

      const pin = crypto.randomInt(1000, 10000).toString();
      const pinHash = await bcrypt.hash(pin, 12);

      const { data: existingPinAuthRows } = await this.supabase
        .from("user_auths")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", "dp_pin")
        .limit(1);

      const existingPinAuth = existingPinAuthRows?.[0] || null;

      if (existingPinAuth?.id) {
        const { error: updatePinError } = await this.supabase
          .from("user_auths")
          .update({
            provider_user_id: normalizedPhone,
            password_hash: pinHash,
          })
          .eq("id", existingPinAuth.id);

        if (updatePinError) throw updatePinError;
      } else {
        const { error: createPinError } = await this.supabase
          .from("user_auths")
          .insert({
            id: uuidv4(),
            user_id: user.id,
            provider: "dp_pin",
            provider_user_id: normalizedPhone,
            password_hash: pinHash,
            created_at: new Date().toISOString(),
          });

        if (createPinError) throw createPinError;
      }

      if (!user.email) {
        throw new Error("Delivery partner email is missing. Cannot send PIN email.");
      }

      const emailResult = await emailService.sendDeliveryPartnerWelcomeEmail(
        user.email,
        user.full_name,
        user.phone,
        pin,
      );

      return {
        message: "New PIN sent to your registered email address.",
        data: {
          pinSent: !emailResult?.error,
          emailError: emailResult?.error || null,
        },
      };
    } catch (error) {
      logger.error("Resend delivery partner PIN error:", error);
      throw error;
    }
  }

  async loginDeliveryPartner(phone, pin) {
    try {
      const normalizedPhone = this.normalizePhone(phone);

      if (!normalizedPhone || !pin) {
        throw new Error("Phone and PIN are required");
      }

      if (!/^\d{4}$/.test(String(pin))) {
        throw new Error("PIN must be a 4-digit number");
      }

      const { data: user, error: userError } = await this.supabase
        .from("users")
        .select("id, full_name, email, phone, is_active, role")
        .eq("phone", normalizedPhone)
        .eq("role", "delivery_partner")
        .single();

      if (userError || !user) {
        throw new Error("Invalid credentials");
      }

      const { data: pinAuthRows, error: pinAuthError } = await this.supabase
        .from("user_auths")
        .select("password_hash")
        .eq("user_id", user.id)
        .eq("provider", "dp_pin")
        .limit(1);

      if (pinAuthError || !pinAuthRows || pinAuthRows.length === 0) {
        throw new Error("Your account is pending admin approval.");
      }

      const pinHash = pinAuthRows[0]?.password_hash;
      const validPin = await bcrypt.compare(String(pin), pinHash || "");

      if (!validPin) {
        throw new Error("Invalid credentials");
      }

      const { data: dpData, error: dpError } = await this.supabase
        .from("delivery_partner_data")
        .select("kyc_status, is_cod_eligible, profile_photo_url")
        .eq("user_id", user.id)
        .single();

      if (dpError || !dpData) {
        throw new Error("Delivery partner profile not found");
      }

      if (dpData.kyc_status === "pending") {
        const tokens = await this.generateTokens(user.id);
        return {
          user: { ...user, profilePhotoUrl: dpData.profile_photo_url || null },
          ...tokens,
          redirect: "kyc_pending_screen",
          kycStatus: "pending",
          isCodEligible: !!dpData.is_cod_eligible,
        };
      }

      if (dpData.kyc_status !== "verified") {
        throw new Error("Your KYC is not verified yet. Please contact support.");
      }

      if (!user.is_active) {
        throw new Error("Your account is inactive. Please contact admin.");
      }

      const tokens = await this.generateTokens(user.id);

      return {
        user: { ...user, profilePhotoUrl: dpData.profile_photo_url || null },
        ...tokens,
        redirect: "home_screen",
        kycStatus: "verified",
        isCodEligible: !!dpData.is_cod_eligible,
      };
    } catch (error) {
      logger.error("Delivery partner login error:", error);
      throw error;
    }
  }
}

const authService = new AuthService(supabase);
export default authService;
