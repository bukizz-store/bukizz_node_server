import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Generate a human-friendly Ticket ID from a UUID.
 * Takes the first 4 hex characters of the UUID (hyphens stripped),
 * converts to a decimal number, and prefixes with #TK-.
 * Example: "a1b2c3d4-..." → parseInt("a1b2", 16) = 41394 → "#TK-41394"
 * @param {string} uuid
 * @returns {string}
 */
export function generateTicketId(uuid) {
  if (!uuid) return null;
  const hex = uuid.replace(/-/g, "").substring(0, 4).toUpperCase();
  const num = parseInt(hex, 16);
  return `#TK-${num}`;
}

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

  // ── Admin-specific Methods ──────────────────────────────────────────────

  /**
   * Admin: List all queries with pagination, filters, and exact count.
   * Supports status, priority, and search (ticket ID fragment or order_id).
   * @param {Object} filters
   * @returns {{ queries: Array, pagination: Object }}
   */
  async adminFindAll(filters = {}) {
    try {
      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = this.supabase
        .from("order_queries")
        .select("*", { count: "exact" });

      // Status filter
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      // Priority filter
      if (filters.priority) {
        query = query.eq("priority", filters.priority);
      }

      // Search: match ticket-id fragment against id, or order_id
      if (filters.search) {
        const term = filters.search.replace(/^#TK-/i, "").trim();
        query = query.or(
          `id.ilike.%${term}%,order_id.ilike.%${term}%`,
        );
      }

      // Sorting
      const sortBy = filters.sortBy || "created_at";
      const ascending = filters.sortOrder === "asc";
      query = query.order(sortBy, { ascending });

      // Pagination
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count || 0;
      let queriesList = data || [];

      if (queriesList.length > 0) {
        const orderIds = [...new Set(queriesList.map((q) => q.order_id).filter(Boolean))];
        const userIds = [...new Set(queriesList.map((q) => q.user_id).filter(Boolean))];

        let ordersMap = {};
        if (orderIds.length > 0) {
          const { data: ordersData } = await this.supabase
            .from("orders")
            .select("id, order_number")
            .in("id", orderIds);

          const { data: itemsData } = await this.supabase
            .from("order_items")
            .select("order_id, id, title, variant, dispatch_id")
            .in("order_id", orderIds);

          if (ordersData) {
            ordersMap = ordersData.reduce((acc, order) => {
              acc[order.id] = {
                orderNumber: order.order_number,
                items: itemsData?.filter((i) => i.order_id === order.id).map(i => ({
                  title: i.title,
                  variant: i.variant,
                  dispatchId: i.dispatch_id
                })) || [],
              };
              return acc;
            }, {});
          }
        }

        let usersMap = {};
        if (userIds.length > 0) {
          const { data: usersData } = await this.supabase
            .from("users")
            .select("id, full_name, email, phone")
            .in("id", userIds);

          if (usersData) {
            usersMap = usersData.reduce((acc, user) => {
              acc[user.id] = {
                name: user.full_name,
                email: user.email,
                phone: user.phone,
              };
              return acc;
            }, {});
          }
        }

        queriesList = queriesList.map((q) => {
          const formatted = this.formatQuery(q);
          return {
            ...formatted,
            customer: usersMap[q.user_id] || null,
            order: ordersMap[q.order_id] || null,
          };
        });
      }

      return {
        queries: queriesList,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error("Error in adminFindAll:", error);
      throw error;
    }
  }

  /**
   * Admin: Fetch a single query with rich related data.
   * Returns query + order details + customer details + conversation thread.
   * @param {string} id - Query UUID
   * @returns {Object|null}
   */
  async adminFindByIdDetailed(id) {
    try {
      // 1. Fetch the query itself
      const { data: queryData, error: queryError } = await this.supabase
        .from("order_queries")
        .select("*")
        .eq("id", id)
        .single();

      if (queryError) {
        if (queryError.code === "PGRST116") return null;
        throw queryError;
      }

      if (!queryData) return null;

      const formatted = this.formatQuery(queryData);

      // 2. Fetch related Order with items
      let orderDetails = null;
      if (queryData.order_id) {
        const { data: orderData, error: orderError } = await this.supabase
          .from("orders")
          .select("id, order_number, total_amount, currency, status, payment_method, payment_status, created_at")
          .eq("id", queryData.order_id)
          .single();

        if (!orderError && orderData) {
          // Fetch order items
          const { data: itemsData } = await this.supabase
            .from("order_items")
            .select("id, title, sku, quantity, unit_price, total_price, status, product_snapshot")
            .eq("order_id", queryData.order_id)
            .order("created_at", { ascending: true });

          orderDetails = {
            id: orderData.id,
            orderNumber: orderData.order_number,
            totalAmount: parseFloat(orderData.total_amount || 0),
            currency: orderData.currency,
            status: orderData.status,
            paymentMethod: orderData.payment_method,
            paymentStatus: orderData.payment_status,
            createdAt: orderData.created_at,
            items: (itemsData || []).map((item) => ({
              id: item.id,
              title: item.title,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: parseFloat(item.unit_price || 0),
              totalPrice: parseFloat(item.total_price || 0),
              status: item.status,
              image: item.product_snapshot?.image_url || item.product_snapshot?.image || null,
            })),
          };
        }
      }

      // 3. Fetch Customer details
      let customerDetails = null;
      if (queryData.user_id) {
        const { data: userData, error: userError } = await this.supabase
          .from("users")
          .select("id, full_name, email, phone, created_at")
          .eq("id", queryData.user_id)
          .single();

        if (!userError && userData) {
          // Calculate lifetime stats: total orders & LTV
          const { count: totalOrders } = await this.supabase
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("user_id", queryData.user_id);

          const { data: ltvData } = await this.supabase
            .from("orders")
            .select("total_amount")
            .eq("user_id", queryData.user_id)
            .in("status", ["processed", "shipped", "out_for_delivery", "delivered"]);

          const ltv = (ltvData || []).reduce(
            (sum, o) => sum + parseFloat(o.total_amount || 0),
            0,
          );

          customerDetails = {
            id: userData.id,
            name: userData.full_name,
            email: userData.email,
            phone: userData.phone,
            joinedDate: userData.created_at,
            totalLifetimeOrders: totalOrders || 0,
            ltv: parseFloat(ltv.toFixed(2)),
          };
        }
      }

      // 4. Extract conversation thread from metadata.replies
      const thread = [];

      // Add the original message as the first entry
      thread.push({
        id: "original",
        sender: customerDetails?.name || "Customer",
        senderRole: "customer",
        message: queryData.message,
        attachments: queryData.attachments || [],
        createdAt: queryData.created_at,
      });

      // Append replies from metadata
      const replies = queryData.metadata?.replies || [];
      thread.push(...replies);

      return {
        ...formatted,
        order: orderDetails,
        customer: customerDetails,
        thread,
      };
    } catch (error) {
      logger.error("Error in adminFindByIdDetailed:", error);
      throw error;
    }
  }

  /**
   * Add a reply to the query's metadata.replies array.
   * @param {string} id - Query UUID
   * @param {Object} replyData - { id, sender, senderRole, message, attachments, createdAt }
   * @returns {Object} Updated formatted query
   */
  async addReply(id, replyData) {
    try {
      // Read current metadata
      const { data: current, error: fetchError } = await this.supabase
        .from("order_queries")
        .select("metadata")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const metadata = current?.metadata || {};
      const replies = metadata.replies || [];
      replies.push(replyData);
      metadata.replies = replies;

      // Write back
      const { error: updateError } = await this.supabase
        .from("order_queries")
        .update({
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) throw updateError;

      return this.findById(id);
    } catch (error) {
      logger.error("Error adding reply to order query:", error);
      throw error;
    }
  }

  /**
   * Admin: Update query status.
   * @param {string} id - Query UUID
   * @param {string} status - New status value
   * @param {string} [note] - Optional note stored in metadata
   * @returns {Object} Updated formatted query
   */
  async adminUpdateStatus(id, status, note) {
    try {
      // Read current metadata to append status change note
      const { data: current, error: fetchError } = await this.supabase
        .from("order_queries")
        .select("metadata")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const metadata = current?.metadata || {};

      // Log status changes in metadata
      if (!metadata.statusHistory) metadata.statusHistory = [];
      metadata.statusHistory.push({
        status,
        note: note || null,
        changedAt: new Date().toISOString(),
      });

      const { error: updateError } = await this.supabase
        .from("order_queries")
        .update({
          status,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) throw updateError;

      return this.findById(id);
    } catch (error) {
      logger.error("Error updating order query status:", error);
      throw error;
    }
  }

  // ── Existing methods (unchanged) ────────────────────────────────────────

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
          assigned_to: closedBy,
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
      let query = this.supabase
        .from("order_queries")
        .select("status, created_at, updated_at");

      if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
      if (filters.startDate) query = query.gte("created_at", filters.startDate);
      if (filters.endDate) query = query.lte("created_at", filters.endDate);

      const { data, error } = await query;
      if (error) throw error;

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

  // ── Formatters ───────────────────────────────────────────────────────────

  /**
   * Format query data
   */
  formatQuery(query) {
    if (!query) return null;
    return {
      id: query.id,
      ticketId: generateTicketId(query.id),
      orderId: query.order_id,
      userId: query.user_id,
      userName: query.user?.full_name,
      userEmail: query.user?.email,
      subject: query.subject,
      message: query.message,
      priority: query.priority,
      status: query.status,
      assignedTo: query.assigned_to,
      assignedToName: query.assigned_user?.full_name,
      resolutionNote: query.resolution_note,
      attachments: query.attachments,
      metadata: query.metadata,
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
