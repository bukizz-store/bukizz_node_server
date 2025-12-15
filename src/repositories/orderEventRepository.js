import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Order Event Repository for Supabase (PostgreSQL)
 * Handles all database operations for order status tracking and history
 */
export class OrderEventRepository {
  constructor(supabase) {
    this.supabase = supabase || getSupabase();
  }

  /**
   * Create a new order event
   */
  async create(eventData) {
    try {
      const eventId = uuidv4();
      const { data, error } = await this.supabase
        .from("order_events")
        .insert({
          id: eventId,
          order_id: eventData.orderId,
          previous_status: eventData.previousStatus || null,
          new_status: eventData.newStatus,
          changed_by: eventData.changedBy || null,
          note: eventData.note || null,
          metadata: eventData.metadata || null,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create order event: ${error.message}`);
      }

      return this.formatEvent(data);
    } catch (error) {
      logger.error("Error creating order event:", error);
      throw error;
    }
  }

  /**
   * Create order event with existing database connection (for atomic operations)
   */
  async createWithConnection(connection, eventData) {
    try {
      const eventId = uuidv4();
      const { data, error } = await connection
        .from("order_events")
        .insert({
          id: eventId,
          order_id: eventData.orderId,
          previous_status: eventData.previousStatus || null,
          new_status: eventData.newStatus,
          changed_by: eventData.changedBy || null,
          note: eventData.note || null,
          metadata: eventData.metadata || null,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create order event: ${error.message}`);
      }

      return this.formatEvent(data);
    } catch (error) {
      logger.error("Error creating order event with connection:", error);
      throw error;
    }
  }

  /**
   * Find event by ID
   */
  async findById(id) {
    try {
      const { data, error } = await this.supabase
        .from("order_events")
        .select(
          `
          *,
          users!changed_by(full_name)
        `
        )
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // No rows found
        throw error;
      }

      return this.formatEvent(data);
    } catch (error) {
      logger.error("Error finding order event by ID:", error);
      throw error;
    }
  }

  /**
   * Get all events for an order
   */
  async findByOrderId(orderId) {
    try {
      const { data, error } = await this.supabase
        .from("order_events")
        .select(
          `
          *,
          users!changed_by(full_name)
        `
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to find events by order ID: ${error.message}`);
      }

      return (data || []).map((event) => this.formatEvent(event));
    } catch (error) {
      logger.error("Error finding events by order ID:", error);
      throw error;
    }
  }

  /**
   * Get events with pagination and filters
   */
  async findAll(filters = {}) {
    try {
      let query = this.supabase.from("order_events").select(`
          *,
          users!changed_by(full_name),
          orders!order_id(order_number)
        `);

      // Apply filters
      if (filters.orderId) {
        query = query.eq("order_id", filters.orderId);
      }
      if (filters.userId) {
        query = query.eq("changed_by", filters.userId);
      }
      if (filters.status) {
        query = query.eq("new_status", filters.status);
      }
      if (filters.startDate) {
        query = query.gte("created_at", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("created_at", filters.endDate);
      }

      // Apply sorting
      const sortBy = filters.sortBy || "created_at";
      const ascending = (filters.sortOrder || "desc").toLowerCase() === "asc";
      query = query.order(sortBy, { ascending });

      // Apply pagination
      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 20;
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to find order events: ${error.message}`);
      }

      return (data || []).map((event) => this.formatEventWithOrder(event));
    } catch (error) {
      logger.error("Error finding order events:", error);
      throw error;
    }
  }

  /**
   * Get latest status for an order
   */
  async getLatestStatus(orderId) {
    try {
      const { data, error } = await this.supabase
        .from("order_events")
        .select("new_status, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // No rows found
        throw error;
      }

      return {
        status: data.new_status,
        updatedAt: data.created_at,
      };
    } catch (error) {
      logger.error("Error getting latest order status:", error);
      throw error;
    }
  }

  /**
   * Count events by status for analytics
   */
  async getStatusCounts(filters = {}) {
    try {
      let query = this.supabase.from("order_events").select("new_status");

      if (filters.startDate) {
        query = query.gte("created_at", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("created_at", filters.endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to get status counts: ${error.message}`);
      }

      // Group by status manually since Supabase doesn't have direct GROUP BY
      const counts = {};
      (data || []).forEach((event) => {
        const status = event.new_status;
        counts[status] = (counts[status] || 0) + 1;
      });

      return counts;
    } catch (error) {
      logger.error("Error getting status counts:", error);
      throw error;
    }
  }

  /**
   * Get order timeline (all events for multiple orders)
   */
  async getOrderTimeline(orderIds) {
    if (!orderIds || orderIds.length === 0) return [];

    try {
      const { data, error } = await this.supabase
        .from("order_events")
        .select(
          `
          *,
          users!changed_by(full_name),
          orders!order_id(order_number)
        `
        )
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to get order timeline: ${error.message}`);
      }

      return (data || []).map((event) => this.formatEventWithOrder(event));
    } catch (error) {
      logger.error("Error getting order timeline:", error);
      throw error;
    }
  }

  /**
   * Count total events
   */
  async count(filters = {}) {
    try {
      let query = this.supabase
        .from("order_events")
        .select("*", { count: "exact", head: true });

      if (filters.orderId) {
        query = query.eq("order_id", filters.orderId);
      }
      if (filters.userId) {
        query = query.eq("changed_by", filters.userId);
      }
      if (filters.status) {
        query = query.eq("new_status", filters.status);
      }
      if (filters.startDate) {
        query = query.gte("created_at", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("created_at", filters.endDate);
      }

      const { count, error } = await query;

      if (error) {
        throw new Error(`Failed to count order events: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      logger.error("Error counting order events:", error);
      throw error;
    }
  }

  /**
   * Count events by order ID
   */
  async countByOrderId(orderId) {
    try {
      const { count, error } = await this.supabase
        .from("order_events")
        .select("*", { count: "exact", head: true })
        .eq("order_id", orderId);

      if (error) {
        throw new Error(`Failed to count events by order ID: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      logger.error("Error counting events by order ID:", error);
      throw error;
    }
  }

  /**
   * Format event data
   */
  formatEvent(event) {
    return {
      id: event.id,
      orderId: event.order_id,
      previousStatus: event.previous_status,
      newStatus: event.new_status,
      changedBy: event.changed_by,
      changedByName: event.users?.full_name,
      note: event.note,
      metadata: event.metadata || {},
      createdAt: event.created_at,
    };
  }

  /**
   * Format event data with order information
   */
  formatEventWithOrder(event) {
    return {
      ...this.formatEvent(event),
      orderNumber: event.orders?.order_number,
    };
  }
}

export default new OrderEventRepository();
