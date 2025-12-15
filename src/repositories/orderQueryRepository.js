import { executeQuery } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Order Query Repository
 * Handles all database operations for order-related customer queries and support tickets
 */
export class OrderQueryRepository {
  /**
   * Create a new order query
   */
  async create(queryData) {
    const query = `
      INSERT INTO order_queries (id, order_id, user_id, subject, message, status, attachments, created_at, updated_at)
      VALUES (UUID(), ?, ?, ?, ?, 'open', ?, NOW(), NOW())
    `;

    const params = [
      queryData.orderId,
      queryData.userId,
      queryData.subject,
      queryData.message,
      queryData.attachments ? JSON.stringify(queryData.attachments) : null,
    ];

    try {
      const result = await executeQuery(query, params);
      return this.findById(result.insertId);
    } catch (error) {
      logger.error("Error creating order query:", error);
      throw error;
    }
  }

  /**
   * Find query by ID
   */
  async findById(id) {
    const query = `
      SELECT oq.*, 
             u.full_name as user_name, u.email as user_email,
             a.full_name as assigned_to_name,
             o.order_number
      FROM order_queries oq
      LEFT JOIN users u ON oq.user_id = u.id
      LEFT JOIN users a ON oq.assigned_to = a.id
      LEFT JOIN orders o ON oq.order_id = o.id
      WHERE oq.id = ?
    `;

    try {
      const results = await executeQuery(query, [id]);
      if (results.length === 0) return null;

      return this.formatQuery(results[0]);
    } catch (error) {
      logger.error("Error finding order query by ID:", error);
      throw error;
    }
  }

  /**
   * Get all queries for an order
   */
  async findByOrderId(orderId) {
    const query = `
      SELECT oq.*, 
             u.full_name as user_name, u.email as user_email,
             a.full_name as assigned_to_name
      FROM order_queries oq
      LEFT JOIN users u ON oq.user_id = u.id
      LEFT JOIN users a ON oq.assigned_to = a.id
      WHERE oq.order_id = ?
      ORDER BY oq.created_at DESC
    `;

    try {
      const results = await executeQuery(query, [orderId]);
      return results.map((query) => this.formatQuery(query));
    } catch (error) {
      logger.error("Error finding queries by order ID:", error);
      throw error;
    }
  }

  /**
   * Get all queries for a user
   */
  async findByUserId(userId, filters = {}) {
    let query = `
      SELECT oq.*, 
             a.full_name as assigned_to_name,
             o.order_number
      FROM order_queries oq
      LEFT JOIN users a ON oq.assigned_to = a.id
      LEFT JOIN orders o ON oq.order_id = o.id
      WHERE oq.user_id = ?
    `;
    const params = [userId];

    if (filters.status) {
      query += " AND oq.status = ?";
      params.push(filters.status);
    }

    // Apply sorting
    const sortBy = filters.sortBy || "created_at";
    const sortOrder = filters.sortOrder || "desc";
    query += ` ORDER BY oq.${sortBy} ${sortOrder.toUpperCase()}`;

    // Apply pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    try {
      const results = await executeQuery(query, params);
      return results.map((query) => this.formatQueryWithOrder(query));
    } catch (error) {
      logger.error("Error finding queries by user ID:", error);
      throw error;
    }
  }

  /**
   * Get queries with pagination and filters
   */
  async findAll(filters = {}) {
    let query = `
      SELECT oq.*, 
             u.full_name as user_name, u.email as user_email,
             a.full_name as assigned_to_name,
             o.order_number
      FROM order_queries oq
      LEFT JOIN users u ON oq.user_id = u.id
      LEFT JOIN users a ON oq.assigned_to = a.id
      LEFT JOIN orders o ON oq.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    // Apply filters
    if (filters.orderId) {
      query += " AND oq.order_id = ?";
      params.push(filters.orderId);
    }

    if (filters.userId) {
      query += " AND oq.user_id = ?";
      params.push(filters.userId);
    }

    if (filters.assignedTo) {
      query += " AND oq.assigned_to = ?";
      params.push(filters.assignedTo);
    }

    if (filters.status) {
      query += " AND oq.status = ?";
      params.push(filters.status);
    }

    // Apply sorting
    const sortBy = filters.sortBy || "created_at";
    const sortOrder = filters.sortOrder || "desc";
    query += ` ORDER BY oq.${sortBy} ${sortOrder.toUpperCase()}`;

    // Apply pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    try {
      const results = await executeQuery(query, params);
      return results.map((query) => this.formatQueryWithOrder(query));
    } catch (error) {
      logger.error("Error finding order queries:", error);
      throw error;
    }
  }

  /**
   * Update query
   */
  async update(id, updateData) {
    const fields = [];
    const params = [];

    if (updateData.subject !== undefined) {
      fields.push("subject = ?");
      params.push(updateData.subject);
    }
    if (updateData.message !== undefined) {
      fields.push("message = ?");
      params.push(updateData.message);
    }
    if (updateData.status !== undefined) {
      fields.push("status = ?");
      params.push(updateData.status);
    }
    if (updateData.assignedTo !== undefined) {
      fields.push("assigned_to = ?");
      params.push(updateData.assignedTo);
    }
    if (updateData.resolutionNote !== undefined) {
      fields.push("resolution_note = ?");
      params.push(updateData.resolutionNote);
    }
    if (updateData.attachments !== undefined) {
      fields.push("attachments = ?");
      params.push(
        updateData.attachments ? JSON.stringify(updateData.attachments) : null
      );
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push("updated_at = NOW()");
    params.push(id);

    const query = `UPDATE order_queries SET ${fields.join(", ")} WHERE id = ?`;

    try {
      await executeQuery(query, params);
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
    const query =
      "UPDATE order_queries SET assigned_to = ?, updated_at = NOW() WHERE id = ?";

    try {
      await executeQuery(query, [assignedTo, id]);
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
    const query = `
      UPDATE order_queries 
      SET status = 'closed', resolution_note = ?, assigned_to = ?, updated_at = NOW() 
      WHERE id = ?
    `;

    try {
      await executeQuery(query, [resolutionNote, closedBy, id]);
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
    let query = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(TIMESTAMPDIFF(HOUR, created_at, 
          CASE WHEN status = 'closed' THEN updated_at ELSE NOW() END
        )) as avg_resolution_hours
      FROM order_queries
      WHERE 1=1
    `;
    const params = [];

    if (filters.assignedTo) {
      query += " AND assigned_to = ?";
      params.push(filters.assignedTo);
    }

    if (filters.startDate) {
      query += " AND created_at >= ?";
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += " AND created_at <= ?";
      params.push(filters.endDate);
    }

    query += " GROUP BY status";

    try {
      const results = await executeQuery(query, params);
      return results.reduce((acc, row) => {
        acc[row.status] = {
          count: row.count,
          avgResolutionHours: parseFloat(row.avg_resolution_hours) || 0,
        };
        return acc;
      }, {});
    } catch (error) {
      logger.error("Error getting query statistics:", error);
      throw error;
    }
  }

  /**
   * Count total queries
   */
  async count(filters = {}) {
    let query = "SELECT COUNT(*) as total FROM order_queries WHERE 1=1";
    const params = [];

    if (filters.orderId) {
      query += " AND order_id = ?";
      params.push(filters.orderId);
    }

    if (filters.userId) {
      query += " AND user_id = ?";
      params.push(filters.userId);
    }

    if (filters.assignedTo) {
      query += " AND assigned_to = ?";
      params.push(filters.assignedTo);
    }

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    try {
      const results = await executeQuery(query, params);
      return results[0].total;
    } catch (error) {
      logger.error("Error counting order queries:", error);
      throw error;
    }
  }

  /**
   * Format query data
   */
  formatQuery(query) {
    return {
      id: query.id,
      orderId: query.order_id,
      userId: query.user_id,
      userName: query.user_name,
      userEmail: query.user_email,
      subject: query.subject,
      message: query.message,
      status: query.status,
      assignedTo: query.assigned_to,
      assignedToName: query.assigned_to_name,
      resolutionNote: query.resolution_note,
      attachments: query.attachments ? JSON.parse(query.attachments) : null,
      createdAt: query.created_at,
      updatedAt: query.updated_at,
    };
  }

  /**
   * Format query data with order information
   */
  formatQueryWithOrder(query) {
    return {
      ...this.formatQuery(query),
      orderNumber: query.order_number,
    };
  }
}

export default new OrderQueryRepository();
