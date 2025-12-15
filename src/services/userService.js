import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * User Service
 * Handles user management business logic with enhanced schema support
 */
export class UserService {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  /**
   * Get user profile with enhanced details
   */
  async getProfile(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      return this._sanitizeUser(user);
    } catch (error) {
      logger.error("Error getting user profile:", error);
      throw error;
    }
  }

  /**
   * Update user profile with enhanced validation
   */
  async updateProfile(userId, updateData) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      // Validate email uniqueness if being updated
      if (updateData.email && updateData.email !== user.email) {
        const existingUser = await this.userRepository.findByEmail(
          updateData.email
        );
        if (existingUser && existingUser.id !== userId) {
          throw new AppError("Email address is already in use", 409);
        }

        // Mark email as unverified if changed
        updateData.emailVerified = false;
      }

      // Validate phone uniqueness if being updated
      if (updateData.phone && updateData.phone !== user.phone) {
        const existingUser = await this.userRepository.findByPhone(
          updateData.phone
        );
        if (existingUser && existingUser.id !== userId) {
          throw new AppError("Phone number is already in use", 409);
        }

        // Mark phone as unverified if changed
        updateData.phoneVerified = false;
      }

      // Validate date of birth
      if (updateData.dateOfBirth) {
        const dob = new Date(updateData.dateOfBirth);
        const now = new Date();
        const age = now.getFullYear() - dob.getFullYear();

        if (age < 13) {
          throw new AppError("User must be at least 13 years old", 400);
        }

        if (dob > now) {
          throw new AppError("Date of birth cannot be in the future", 400);
        }
      }

      // Validate gender
      if (updateData.gender) {
        const validGenders = ["male", "female", "other", "prefer_not_to_say"];
        if (!validGenders.includes(updateData.gender)) {
          throw new AppError(
            `Invalid gender. Must be one of: ${validGenders.join(", ")}`,
            400
          );
        }
      }

      const updatedUser = await this.userRepository.update(userId, updateData);

      logger.info(`User profile updated: ${userId}`);
      return this._sanitizeUser(updatedUser);
    } catch (error) {
      logger.error("Error updating user profile:", error);
      throw error;
    }
  }

  /**
   * Get user addresses with enhanced details
   */
  async getAddresses(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      return await this.userRepository.getAddresses(userId);
    } catch (error) {
      logger.error("Error getting user addresses:", error);
      throw error;
    }
  }

  /**
   * Add user address with enhanced validation
   */
  async addAddress(userId, addressData) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      // Log the received data for debugging
      console.log(
        "Received addressData:",
        JSON.stringify(addressData, null, 2)
      );

      // Validate required fields with better error handling
      const requiredFields = [
        "label", // Changed from "type" to "label"
        "line1",
        "city",
        "state",
        "country",
        "postalCode",
      ];

      for (const field of requiredFields) {
        // Check if field exists and is not null/undefined
        if (!addressData[field]) {
          throw new AppError(`${field} is required`, 400);
        }

        // Convert to string and check if it's empty after trimming
        const fieldValue = String(addressData[field]).trim();
        if (fieldValue === "") {
          throw new AppError(`${field} cannot be empty`, 400);
        }
      }

      // Validate address label (replaced type validation)
      const validLabels = ["Home", "Work", "School", "Office", "Other"];
      if (!validLabels.includes(addressData.label)) {
        throw new AppError(
          `Invalid address label. Must be one of: ${validLabels.join(", ")}`,
          400
        );
      }

      // Validate postal code format (basic validation)
      if (!/^\d{6}$/.test(addressData.postalCode)) {
        throw new AppError("Invalid postal code format. Must be 6 digits", 400);
      }

      // Check address limit (max 5 addresses per user)
      const existingAddresses = await this.userRepository.getAddresses(userId);
      if (existingAddresses.length >= 5) {
        throw new AppError("Maximum 5 addresses allowed per user", 400);
      }

      const address = await this.userRepository.addAddress(userId, addressData);

      logger.info(`Address added for user: ${userId}`);
      return address;
    } catch (error) {
      // Log the full error for debugging
      console.error("Error in addAddress:", error);
      logger.error("Error adding user address:", error);
      throw error;
    }
  }

  /**
   * Update user address
   */
  async updateAddress(userId, addressId, updateData) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      // Validate address ownership
      const address = await this.userRepository.getAddressById(addressId);
      if (!address || address.userId !== userId) {
        throw new AppError("Address not found or access denied", 404);
      }

      // Validate address type if provided
      if (updateData.type) {
        const validTypes = ["home", "work", "school", "other"];
        if (!validTypes.includes(updateData.type)) {
          throw new AppError(
            `Invalid address type. Must be one of: ${validTypes.join(", ")}`,
            400
          );
        }
      }

      // Validate postal code if provided
      if (updateData.postalCode && !/^\d{6}$/.test(updateData.postalCode)) {
        throw new AppError("Invalid postal code format. Must be 6 digits", 400);
      }

      const updatedAddress = await this.userRepository.updateAddress(
        addressId,
        updateData
      );

      logger.info(`Address updated: ${addressId} for user: ${userId}`);
      return updatedAddress;
    } catch (error) {
      logger.error("Error updating user address:", error);
      throw error;
    }
  }

  /**
   * Delete user address
   */
  async deleteAddress(userId, addressId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      // Validate address ownership
      const address = await this.userRepository.getAddressById(addressId);
      if (!address || address.userId !== userId) {
        throw new AppError("Address not found or access denied", 404);
      }

      await this.userRepository.deleteAddress(addressId);

      logger.info(`Address deleted: ${addressId} for user: ${userId}`);
      return { message: "Address deleted successfully" };
    } catch (error) {
      logger.error("Error deleting user address:", error);
      throw error;
    }
  }

  /**
   * Get user preferences and settings
   */
  async getPreferences(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      return await this.userRepository.getPreferences(userId);
    } catch (error) {
      logger.error("Error getting user preferences:", error);
      throw error;
    }
  }

  /**
   * Update user preferences and settings
   */
  async updatePreferences(userId, preferences) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      // Validate notification preferences
      if (preferences.notifications) {
        const validNotificationTypes = [
          "order_updates",
          "promotions",
          "newsletters",
          "product_recommendations",
        ];

        for (const [type, enabled] of Object.entries(
          preferences.notifications
        )) {
          if (!validNotificationTypes.includes(type)) {
            throw new AppError(`Invalid notification type: ${type}`, 400);
          }
          if (typeof enabled !== "boolean") {
            throw new AppError(
              `Notification preference must be boolean: ${type}`,
              400
            );
          }
        }
      }

      // Validate privacy settings
      if (preferences.privacy) {
        const validPrivacySettings = [
          "profile_visibility",
          "data_collection",
          "marketing_emails",
        ];

        for (const setting of Object.keys(preferences.privacy)) {
          if (!validPrivacySettings.includes(setting)) {
            throw new AppError(`Invalid privacy setting: ${setting}`, 400);
          }
        }
      }

      const updatedPreferences = await this.userRepository.updatePreferences(
        userId,
        preferences
      );

      logger.info(`Preferences updated for user: ${userId}`);
      return updatedPreferences;
    } catch (error) {
      logger.error("Error updating user preferences:", error);
      throw error;
    }
  }

  /**
   * Deactivate user account with enhanced cleanup
   */
  async deactivateAccount(userId, reason = null) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!user.isActive) {
        throw new AppError("Account is already deactivated", 400);
      }

      // Check for pending orders
      const pendingOrders = await this.userRepository.getPendingOrders(userId);
      if (pendingOrders.length > 0) {
        throw new AppError(
          "Cannot deactivate account with pending orders. Please cancel or complete them first.",
          400
        );
      }

      await this.userRepository.deactivate(userId, reason);

      logger.info(`User account deactivated: ${userId}`, { reason });
      return { message: "Account deactivated successfully" };
    } catch (error) {
      logger.error("Error deactivating user account:", error);
      throw error;
    }
  }

  /**
   * Reactivate user account
   */
  async reactivateAccount(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (user.isActive) {
        throw new AppError("Account is already active", 400);
      }

      await this.userRepository.reactivate(userId);

      logger.info(`User account reactivated: ${userId}`);
      return { message: "Account reactivated successfully" };
    } catch (error) {
      logger.error("Error reactivating user account:", error);
      throw error;
    }
  }

  /**
   * Mark user email as verified
   */
  async verifyEmail(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (user.emailVerified) {
        return { message: "Email already verified" };
      }

      await this.userRepository.markEmailAsVerified(userId);

      logger.info(`Email verified for user: ${userId}`);
      return { message: "Email verified successfully" };
    } catch (error) {
      logger.error("Error verifying email:", error);
      throw error;
    }
  }

  /**
   * Mark user phone as verified
   */
  async verifyPhone(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (user.phoneVerified) {
        return { message: "Phone already verified" };
      }

      await this.userRepository.markPhoneAsVerified(userId);

      logger.info(`Phone verified for user: ${userId}`);
      return { message: "Phone verified successfully" };
    } catch (error) {
      logger.error("Error verifying phone:", error);
      throw error;
    }
  }

  /**
   * Get user statistics and activity summary
   */
  async getUserStats(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404);
      }

      return await this.userRepository.getUserStatistics(userId);
    } catch (error) {
      logger.error("Error getting user statistics:", error);
      throw error;
    }
  }

  /**
   * Search users (admin functionality)
   */
  async searchUsers(filters) {
    try {
      // Validate filters
      if (filters.role) {
        const validRoles = ["customer", "retailer", "admin"];
        if (!validRoles.includes(filters.role)) {
          throw new AppError(
            `Invalid role filter. Must be one of: ${validRoles.join(", ")}`,
            400
          );
        }
      }

      // Validate pagination
      const page = Math.max(1, parseInt(filters.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));

      const searchFilters = {
        ...filters,
        page,
        limit,
      };

      return await this.userRepository.search(searchFilters);
    } catch (error) {
      logger.error("Error searching users:", error);
      throw error;
    }
  }

  /**
   * Update user role (admin functionality)
   */
  async updateUserRole(userId, newRole, adminUserId) {
    try {
      const validRoles = ["customer", "retailer", "admin"];
      if (!validRoles.includes(newRole)) {
        throw new AppError(
          `Invalid role. Must be one of: ${validRoles.join(", ")}`,
          400
        );
      }

      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (user.role === newRole) {
        throw new AppError(`User already has role: ${newRole}`, 400);
      }

      await this.userRepository.updateRole(userId, newRole);

      logger.info(
        `User role updated: ${userId} from ${user.role} to ${newRole}`,
        {
          adminUserId,
          targetUserId: userId,
          oldRole: user.role,
          newRole,
        }
      );

      return { message: `User role updated to ${newRole}` };
    } catch (error) {
      logger.error("Error updating user role:", error);
      throw error;
    }
  }

  /**
   * Remove sensitive data from user object
   */
  _sanitizeUser(user) {
    // Remove sensitive fields
    const {
      passwordHash,
      resetToken,
      resetTokenExpiry,
      verificationToken,
      ...sanitizedUser
    } = user;

    return sanitizedUser;
  }
}

export default UserService;
