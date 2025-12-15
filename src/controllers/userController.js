import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * User Controller
 * Handles HTTP requests for user management operations with enhanced schema support
 */
export class UserController {
  constructor(userService) {
    this.userService = userService;
  }

  /**
   * Get user profile
   * GET /api/users/profile
   */
  getProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await this.userService.getProfile(userId);

    res.json({
      success: true,
      data: { user },
      message: "Profile retrieved successfully",
    });
  });

  /**
   * Update user profile
   * PUT /api/users/profile
   */
  updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await this.userService.updateProfile(userId, req.body);

    logger.info("User profile updated", { userId });

    res.json({
      success: true,
      data: { user },
      message: "Profile updated successfully",
    });
  });

  /**
   * Get user addresses
   * GET /api/users/addresses
   */
  getAddresses = asyncHandler(async (req, res) => {
    console.log(req);
    const userId = req.user.id;
    const addresses = await this.userService.getAddresses(userId);

    res.json({
      success: true,
      data: { addresses },
      message: "Addresses retrieved successfully",
    });
  });

  /**
   * Add user address
   * POST /api/users/addresses
   */
  addAddress = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const address = await this.userService.addAddress(userId, req.body);

    logger.info("User address added", { userId, addressId: address.id });

    res.status(201).json({
      success: true,
      data: { address },
      message: "Address added successfully",
    });
  });

  /**
   * Update user address
   * PUT /api/users/addresses/:addressId
   */
  updateAddress = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { addressId } = req.params;
    const address = await this.userService.updateAddress(
      userId,
      addressId,
      req.body
    );

    logger.info("User address updated", { userId, addressId });

    res.json({
      success: true,
      data: { address },
      message: "Address updated successfully",
    });
  });

  /**
   * Delete user address
   * DELETE /api/users/addresses/:addressId
   */
  deleteAddress = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { addressId } = req.params;
    const result = await this.userService.deleteAddress(userId, addressId);

    logger.info("User address deleted", { userId, addressId });

    res.json({
      success: true,
      data: result,
      message: "Address deleted successfully",
    });
  });

  /**
   * Get user preferences
   * GET /api/users/preferences
   */
  getPreferences = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const preferences = await this.userService.getPreferences(userId);

    res.json({
      success: true,
      data: { preferences },
      message: "Preferences retrieved successfully",
    });
  });

  /**
   * Update user preferences
   * PUT /api/users/preferences
   */
  updatePreferences = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const preferences = await this.userService.updatePreferences(
      userId,
      req.body
    );

    logger.info("User preferences updated", { userId });

    res.json({
      success: true,
      data: { preferences },
      message: "Preferences updated successfully",
    });
  });

  /**
   * Get user statistics
   * GET /api/users/stats
   */
  getUserStats = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const stats = await this.userService.getUserStats(userId);

    res.json({
      success: true,
      data: stats,
      message: "User statistics retrieved successfully",
    });
  });

  /**
   * Deactivate user account
   * DELETE /api/users/account
   */
  deactivateAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { reason } = req.body;
    const result = await this.userService.deactivateAccount(userId, reason);

    logger.info("User account deactivated", { userId, reason });

    res.json({
      success: true,
      data: result,
      message: "Account deactivated successfully",
    });
  });

  /**
   * Reactivate user account (admin only)
   * POST /api/users/:userId/reactivate
   */
  reactivateAccount = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const result = await this.userService.reactivateAccount(userId);

    logger.info("User account reactivated", { userId });

    res.json({
      success: true,
      data: result,
      message: "Account reactivated successfully",
    });
  });

  /**
   * Verify user email
   * POST /api/users/verify-email
   */
  verifyEmail = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const result = await this.userService.verifyEmail(userId);

    logger.info("User email verified", { userId });

    res.json({
      success: true,
      data: result,
      message: "Email verified successfully",
    });
  });

  /**
   * Verify user phone
   * POST /api/users/verify-phone
   */
  verifyPhone = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const result = await this.userService.verifyPhone(userId);

    logger.info("User phone verified", { userId });

    res.json({
      success: true,
      data: result,
      message: "Phone verified successfully",
    });
  });

  // Admin-only endpoints

  /**
   * Search users (admin only)
   * GET /api/users/search
   */
  searchUsers = asyncHandler(async (req, res) => {
    const result = await this.userService.searchUsers(req.query);

    res.json({
      success: true,
      data: result,
      message: "Users search completed successfully",
    });
  });

  /**
   * Get user by ID (admin only)
   * GET /api/users/:userId
   */
  getUserById = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const user = await this.userService.getProfile(userId);

    res.json({
      success: true,
      data: { user },
      message: "User retrieved successfully",
    });
  });

  /**
   * Update user role (admin only)
   * PUT /api/users/:userId/role
   */
  updateUserRole = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
    const adminUserId = req.user.userId;

    const result = await this.userService.updateUserRole(
      userId,
      role,
      adminUserId
    );

    logger.info("User role updated", {
      targetUserId: userId,
      newRole: role,
      adminUserId,
    });

    res.json({
      success: true,
      data: result,
      message: "User role updated successfully",
    });
  });

  /**
   * Bulk update users (admin only)
   * PUT /api/users/bulk-update
   */
  bulkUpdateUsers = asyncHandler(async (req, res) => {
    const { updates } = req.body;
    const adminUserId = req.user.userId;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const update of updates) {
      try {
        const { userId, action, data } = update;

        switch (action) {
          case "updateRole":
            await this.userService.updateUserRole(
              userId,
              data.role,
              adminUserId
            );
            break;
          case "deactivate":
            await this.userService.deactivateAccount(userId, data.reason);
            break;
          case "reactivate":
            await this.userService.reactivateAccount(userId);
            break;
          default:
            throw new Error(`Invalid action: ${action}`);
        }

        results.push({ userId, success: true, action });
        successCount++;
      } catch (error) {
        results.push({
          userId: update.userId,
          success: false,
          action: update.action,
          error: error.message,
        });
        failureCount++;
      }
    }

    logger.info("Bulk user update completed", {
      total: updates.length,
      successful: successCount,
      failed: failureCount,
      adminUserId,
    });

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: updates.length,
          successful: successCount,
          failed: failureCount,
        },
      },
      message: "Bulk user update completed",
    });
  });

  /**
   * Export users data (admin functionality)
   * GET /api/users/export
   */
  exportUsers = asyncHandler(async (req, res) => {
    const filters = req.query;
    const result = await this.userService.searchUsers({
      ...filters,
      limit: 1000, // Large limit for export
    });

    // Transform data for export
    const exportData = result.users.map((user) => ({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      city: user.city,
      state: user.state,
      schoolId: user.schoolId,
    }));

    res.json({
      success: true,
      data: {
        users: exportData,
        summary: result.pagination,
        exportedAt: new Date().toISOString(),
      },
      message: "Users exported successfully",
    });
  });
}
