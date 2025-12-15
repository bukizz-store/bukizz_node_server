import { logger } from "../utils/logger.js";

/**
 * User Repository
 * Handles all user-related database operations using Supabase
 */
export class UserRepository {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Find user by ID
   */
  async findById(userId) {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // No rows found
        throw error;
      }

      return this.formatUser(data);
    } catch (error) {
      logger.error("Error finding user by ID:", error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email) {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // No rows found
        throw error;
      }

      return this.formatUser(data);
    } catch (error) {
      logger.error("Error finding user by email:", error);
      throw error;
    }
  }

  /**
   * Find user by phone
   */
  async findByPhone(phone) {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("*")
        .eq("phone", phone)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // No rows found
        throw error;
      }

      return this.formatUser(data);
    } catch (error) {
      logger.error("Error finding user by phone:", error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async update(userId, updateData) {
    try {
      // Map camelCase to snake_case for database columns
      const dbUpdateData = {};

      if (updateData.fullName !== undefined) {
        dbUpdateData.full_name = updateData.fullName;
      }
      if (updateData.phone !== undefined) {
        dbUpdateData.phone = updateData.phone;
      }
      if (updateData.emailVerified !== undefined) {
        dbUpdateData.email_verified = updateData.emailVerified;
      }
      if (updateData.phoneVerified !== undefined) {
        dbUpdateData.phone_verified = updateData.phoneVerified;
      }
      if (updateData.dateOfBirth !== undefined) {
        dbUpdateData.date_of_birth = updateData.dateOfBirth;
      }
      if (updateData.gender !== undefined) {
        dbUpdateData.gender = updateData.gender;
      }
      if (updateData.city !== undefined) {
        dbUpdateData.city = updateData.city;
      }
      if (updateData.state !== undefined) {
        dbUpdateData.state = updateData.state;
      }
      if (updateData.schoolId !== undefined) {
        dbUpdateData.school_id = updateData.schoolId;
      }
      if (updateData.role !== undefined) {
        dbUpdateData.role = updateData.role;
      }
      if (updateData.isActive !== undefined) {
        dbUpdateData.is_active = updateData.isActive;
      }
      if (updateData.metadata !== undefined) {
        dbUpdateData.metadata = updateData.metadata;
      }

      // Always update the timestamp
      dbUpdateData.updated_at = new Date().toISOString();

      const { data, error } = await this.supabase
        .from("users")
        .update(dbUpdateData)
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;

      return this.formatUser(data);
    } catch (error) {
      logger.error("Error updating user:", error);
      throw error;
    }
  }

  /**
   * Get user addresses
   */
  async getAddresses(userId) {
    try {
      const { data, error } = await this.supabase
        .from("addresses")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      console.log("User addresses data:", data);

      return data?.map((row) => this.formatAddress(row)) || [];
    } catch (error) {
      logger.error("Error getting user addresses:", error);
      throw error;
    }
  }

  /**
   * Add user address
   */
  async addAddress(userId, addressData) {
    try {
      // If this is the default address, unset other defaults first
      if (addressData.is_default) {
        await this.supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", userId);
      }

      const { data, error } = await this.supabase
        .from("addresses")
        .insert([
          {
            user_id: userId,
            label: addressData.label, // Use label directly from request
            recipient_name: addressData.recipientName || null,
            phone: addressData.phone || null,
            line1: addressData.line1,
            line2: addressData.line2,
            city: addressData.city,
            state: addressData.state,
            country: addressData.country || "India",
            postal_code: addressData.postalCode,
            is_default: addressData.is_default || false,
            lat: addressData.lat || null,
            lng: addressData.lng || null,
            is_active: true,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return this.formatAddress(data);
    } catch (error) {
      logger.error("Error adding address:", error);
      throw error;
    }
  }

  /**
   * Update address
   */
  async updateAddress(addressId, updateData) {
    try {
      // Map camelCase to snake_case for database columns
      const dbUpdateData = {};

      if (updateData.label !== undefined) {
        dbUpdateData.label = updateData.label;
      }
      if (updateData.recipientName !== undefined) {
        dbUpdateData.recipient_name = updateData.recipientName;
      }
      if (updateData.phone !== undefined) {
        dbUpdateData.phone = updateData.phone;
      }
      if (updateData.line1 !== undefined) {
        dbUpdateData.line1 = updateData.line1;
      }
      if (updateData.line2 !== undefined) {
        dbUpdateData.line2 = updateData.line2;
      }
      if (updateData.city !== undefined) {
        dbUpdateData.city = updateData.city;
      }
      if (updateData.state !== undefined) {
        dbUpdateData.state = updateData.state;
      }
      if (updateData.country !== undefined) {
        dbUpdateData.country = updateData.country;
      }
      if (updateData.postalCode !== undefined) {
        dbUpdateData.postal_code = updateData.postalCode;
      }
      if (updateData.is_default !== undefined) {
        dbUpdateData.is_default = updateData.is_default;
      }
      if (updateData.lat !== undefined) {
        dbUpdateData.lat = updateData.lat;
      }
      if (updateData.lng !== undefined) {
        dbUpdateData.lng = updateData.lng;
      }

      const { data, error } = await this.supabase
        .from("addresses")
        .update(dbUpdateData)
        .eq("id", addressId)
        .select()
        .single();

      if (error) throw error;

      return this.formatAddress(data);
    } catch (error) {
      logger.error("Error updating address:", error);
      throw error;
    }
  }

  /**
   * Delete address
   */
  async deleteAddress(addressId) {
    try {
      const { error } = await this.supabase
        .from("addresses")
        .update({ is_active: false })
        .eq("id", addressId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deleting address:", error);
      throw error;
    }
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId) {
    try {
      const { data, error } = await this.supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No preferences found, return defaults
          return {
            notifications: {
              order_updates: true,
              promotions: false,
              newsletters: false,
              product_recommendations: true,
            },
            privacy: {
              profile_visibility: "private",
              data_collection: false,
              marketing_emails: false,
            },
          };
        }
        throw error;
      }

      return data.preferences;
    } catch (error) {
      logger.error("Error getting user preferences:", error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId, preferences) {
    try {
      const { data, error } = await this.supabase
        .from("user_preferences")
        .upsert({
          user_id: userId,
          preferences: preferences,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return data.preferences;
    } catch (error) {
      logger.error("Error updating user preferences:", error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(userId) {
    try {
      // Get order statistics
      const { data: orderStats, error: orderError } = await this.supabase.rpc(
        "get_user_order_stats",
        { p_user_id: userId }
      );

      if (orderError && orderError.code !== "PGRST202") {
        // PGRST202 is function not found, we'll return defaults
        logger.warn("Order stats function not found, returning defaults");
      }

      // Return default stats if function doesn't exist
      return {
        totalOrders: orderStats?.total_orders || 0,
        completedOrders: orderStats?.completed_orders || 0,
        totalSpent: orderStats?.total_spent || 0,
        averageOrderValue: orderStats?.average_order_value || 0,
        lastOrderDate: orderStats?.last_order_date || null,
        memberSince: null, // Will be populated from user data
      };
    } catch (error) {
      logger.error("Error getting user statistics:", error);
      // Return defaults on error
      return {
        totalOrders: 0,
        completedOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        lastOrderDate: null,
        memberSince: null,
      };
    }
  }

  /**
   * Mark email as verified
   */
  async markEmailAsVerified(userId) {
    try {
      const { error } = await this.supabase
        .from("users")
        .update({ email_verified: true })
        .eq("id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("Error verifying email:", error);
      throw error;
    }
  }

  /**
   * Mark phone as verified
   */
  async markPhoneAsVerified(userId) {
    try {
      const { error } = await this.supabase
        .from("users")
        .update({ phone_verified: true })
        .eq("id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("Error verifying phone:", error);
      throw error;
    }
  }

  /**
   * Deactivate user
   */
  async deactivate(userId, reason = null) {
    try {
      const { error } = await this.supabase
        .from("users")
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivation_reason: reason,
        })
        .eq("id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("Error deactivating user:", error);
      throw error;
    }
  }

  /**
   * Reactivate user
   */
  async reactivate(userId) {
    try {
      const { error } = await this.supabase
        .from("users")
        .update({
          is_active: true,
          deactivated_at: null,
          deactivation_reason: null,
        })
        .eq("id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("Error reactivating user:", error);
      throw error;
    }
  }

  /**
   * Search users
   */
  async search(filters) {
    try {
      let query = this.supabase
        .from("users")
        .select(
          "id, full_name, email, phone, role, is_active, email_verified, phone_verified, created_at, last_login_at, city, state, school_id"
        )
        .eq("is_active", true);

      // Apply filters
      if (filters.role) {
        query = query.eq("role", filters.role);
      }

      if (filters.email_verified !== undefined) {
        query = query.eq("email_verified", filters.email_verified);
      }

      if (filters.search) {
        query = query.or(
          `full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        );
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        users: data || [],
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      logger.error("Error searching users:", error);
      throw error;
    }
  }

  /**
   * Update user role
   */
  async updateRole(userId, newRole) {
    try {
      const { error } = await this.supabase
        .from("users")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("Error updating user role:", error);
      throw error;
    }
  }

  /**
   * Get address by ID
   */
  async getAddressById(addressId) {
    try {
      const { data, error } = await this.supabase
        .from("addresses")
        .select("*")
        .eq("id", addressId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }

      return this.formatAddress(data);
    } catch (error) {
      logger.error("Error getting address by ID:", error);
      throw error;
    }
  }

  /**
   * Get pending orders for user
   */
  async getPendingOrders(userId) {
    try {
      const { data, error } = await this.supabase
        .from("orders")
        .select("id, status")
        .eq("user_id", userId)
        .in("status", ["pending", "processing", "shipped"]);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error("Error getting pending orders:", error);
      return []; // Return empty array on error
    }
  }

  /**
   * Format user object for response
   */
  formatUser(row) {
    if (!row) return null;

    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      emailVerified: Boolean(row.email_verified),
      phone: row.phone,
      phoneVerified: Boolean(row.phone_verified),
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      city: row.city,
      state: row.state,
      role: row.role || "customer",
      isActive: Boolean(row.is_active),
      schoolId: row.school_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
    };
  }

  /**
   * Format address object for response
   */
  formatAddress(row) {
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      label: row.label, // Return label as is
      recipientName: row.recipient_name,
      phone: row.phone,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      country: row.country,
      isDefault: Boolean(row.is_default),
      lat: row.lat,
      lng: row.lng,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
    };
  }
}

export default UserRepository;
