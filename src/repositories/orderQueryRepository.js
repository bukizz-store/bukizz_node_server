import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Order Query Repository
 * Handles all database operations for order-related customer queries and support tickets
 */
export class OrderQueryRepository {
  constructor() {
    this.supabase = getSupabase();
  }

  /**
   * Create a new order query
   */
  async create(queryData) {
    try {
      const { data, error } = await this.supabase
        .from("order_queries")
        .insert({
          order_id: queryData.orderId,
          user_id: queryData.userId,
          subject: queryData.subject,
          message: queryData.message,
          status: "open",
          attachments: queryData.attachments
            ? queryData.attachments
            : null,
        })
        .select()
        .single();

      if (error) throw error;
      return this.formatQuery(data);
    } catch (error) {
      logger.error("Error creating order query:", error);
      throw error;
    }
  }

  /**
   * Find query by ID
   */
  async findById(id) {
    try {
      const { data, error } = await this.supabase
        .from("order_queries")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }

      return this.formatQuery(data);
    } catch (error) {
      logger.error("Error finding order query by ID:", error);
      throw error;
    }
  }

  /**
   * Get all queries for an order
   */
  async findByOrderId(orderId) {
    try {
      const { data, error } = await this.supabase
        .from("order_queries")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data.map((query) => this.formatQuery(query));
    } catch (error) {
      logger.error("Error finding queries by order ID:", error);
      throw error;
    }
  }

  /**
   * Get all queries for a user
   */
  async findByUserId(userId, filters = {}) {
    try {
      let query = this.supabase
        .from("order_queries")
        .select("*")
        .eq("user_id", userId);

      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      // Apply sorting
      const sortBy = filters.sortBy || "created_at";
      const ascending = filters.sortOrder === "asc";
      query = query.order(sortBy, { ascending });

      // Apply pagination
      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data, error } = await query;

      if (error) throw error;
      return data.map((query) => this.formatQueryWithOrder(query));
    } catch (error) {
      logger.error("Error finding queries by user ID:", error);
      throw error;
    }
  }

  /**
   * Get queries with pagination and filters
   */
  async findAll(filters = {}) {
    try {
      let query = this.supabase
        .from("order_queries")
        .select("*");

      // Apply filters
      if (filters.orderId) {
        query = query.eq("order_id", filters.orderId);
      }
      if (filters.userId) {
        query = query.eq("user_id", filters.userId);
      }
      if (filters.assignedTo) {
        query = query.eq("assigned_to", filters.assignedTo);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      // Apply sorting
      const sortBy = filters.sortBy || "created_at";
      const ascending = filters.sortOrder === "asc";
      query = query.order(sortBy, { ascending });

      // Apply pagination
      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data, error } = await query;

      if (error) throw error;
      return data.map((query) => this.formatQueryWithOrder(query));
    } catch (error) {
      logger.error("Error finding order queries:", error);
      throw error;
    }
  }

  /**
   * Update query
   */
  async update(id, updateData) {
    try {
      const updates = {};
      if (updateData.subject !== undefined) updates.subject = updateData.subject;
      if (updateData.message !== undefined) updates.message = updateData.message;
      if (updateData.status !== undefined) updates.status = updateData.status;
      if (updateData.assignedTo !== undefined) updates.assigned_to = updateData.assignedTo;
      if (updateData.resolutionNote !== undefined) updates.resolution_note = updateData.resolutionNote;
      if (updateData.attachments !== undefined) updates.attachments = updateData.attachments;

      updates.updated_at = new Date().toISOString();

      const { error } = await this.supabase
        .from("order_queries")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      return this.findById(id);
    } catch (error) {
      logger.error("Error updating order query:", error);
      throw error;
    }
  }

  /**
   * Assign query to user
   */
  async assign(id, assignedTo) {
    try {
      const { error } = await this.supabase
        .from("order_queries")
        .update({
          assigned_to: assignedTo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      return this.findById(id);
    } catch (error) {
      logger.error("Error assigning order query:", error);
      throw error;
    }
  }

  /**
   * Close query with resolution
   */
  async close(id, resolutionNote, closedBy) {
    try {
      const { error } = await this.supabase
        .from("order_queries")
        .update({
          status: "closed",
          resolution_note: resolutionNote,
          assigned_to: closedBy, // Assuming closedBy is the resolver? Or keep original assignee?
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      return this.findById(id);
    } catch (error) {
      logger.error("Error closing order query:", error);
      throw error;
    }
  }

  /**
   * Get query statistics
   */
  async getStats(filters = {}) {
    try {
      // Supabase doesn't support complex aggregations like AVG(TIMESTAMPDIFF) easily via client.
      // We'll fetch basics or use RPC if available. 
      // For now, let's just get counts by status. 
      let query = this.supabase
        .from("order_queries")
        .select("status, created_at, updated_at");

      if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
      if (filters.startDate) query = query.gte("created_at", filters.startDate);
      if (filters.endDate) query = query.lte("created_at", filters.endDate);

      const { data, error } = await query;
      if (error) throw error;

      // Compute stats in memory (Assuming data volume isn't massive for now)
      const stats = {};

      data.forEach(row => {
        if (!stats[row.status]) {
          stats[row.status] = { count: 0, avgResolutionHours: 0, totalResolutionTime: 0, resolvedCount: 0 };
        }
        stats[row.status].count++;

        if (row.status === 'closed' || row.status === 'resolved') {
          const created = new Date(row.created_at);
          const updated = new Date(row.updated_at);
          const hours = (updated - created) / (1000 * 60 * 60);
          stats[row.status].totalResolutionTime += hours;
          stats[row.status].resolvedCount++;
        }
      });

      // Calculate averages
      Object.keys(stats).forEach(status => {
        if (stats[status].resolvedCount > 0) {
          stats[status].avgResolutionHours = stats[status].totalResolutionTime / stats[status].resolvedCount;
        }
      });

      return stats;
    } catch (error) {
      logger.error("Error getting query statistics:", error);
      throw error;
    }
  }

  /**
   * Count total queries
   */
  async count(filters = {}) {
    try {
      let query = this.supabase
        .from("order_queries")
        .select("*", { count: "exact", head: true });

      if (filters.orderId) query = query.eq("order_id", filters.orderId);
      if (filters.userId) query = query.eq("user_id", filters.userId);
      if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
      if (filters.status) query = query.eq("status", filters.status);

      const { count, error } = await query;
      if (error) throw error;
      return count;
    } catch (error) {
      logger.error("Error counting order queries:", error);
      throw error;
    }
  }

  /**
   * Format query data
   */
  formatQuery(query) {
    if (!query) return null;
    return {
      id: query.id,
      orderId: query.order_id,
      userId: query.user_id,
      userName: query.user?.full_name,
      userEmail: query.user?.email,
      subject: query.subject,
      message: query.message,
      status: query.status,
      assignedTo: query.assigned_to,
      assignedToName: query.assigned_user?.full_name,
      resolutionNote: query.resolution_note,
      attachments: query.attachments, // Supabase handles JSON
      createdAt: query.created_at,
      updatedAt: query.updated_at,
    };
  }

  /**
   * Format query data with order information
   */
  formatQueryWithOrder(query) {
    if (!query) return null;
    return {
      ...this.formatQuery(query),
      orderNumber: query.order?.order_number,
    };
  }
}

export default new OrderQueryRepository();
