import { getSupabase } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

/**
 * Order Repository for Supabase (PostgreSQL)
 * Handles all order-related database operations with atomic transaction support
 */
export class OrderRepository {
  constructor(supabase) {
    this.supabase = supabase || getSupabase();
  }

  /**
   * Execute atomic transaction with rollback capability
   * Note: Supabase handles transactions automatically for single operations
   * For complex transactions, we'll use sequential operations with error handling
   */
  async executeTransaction(callback) {
    try {
      // For Supabase, we'll simulate transactions with careful error handling
      return await callback(this.supabase);
    } catch (error) {
      logger.error("Transaction failed:", error);
      throw error;
    }
  }

  /**
   * Create order with existing database connection (for atomic operations)
   */
  async createWithConnection(connection, orderData) {
    const {
      userId,
      items,
      totalAmount,
      currency = "INR",
      shippingAddress,
      billingAddress,
      contactPhone,
      contactEmail,
      paymentMethod,
      paymentStatus = "pending",
      status = "initialized",
      metadata = {},
    } = orderData;

    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 6)}`;

    try {
      // Create main order record using Supabase
      const { data: orderData, error: orderError } = await this.supabase
        .from("orders")
        .insert({
          id: orderId,
          order_number: orderNumber,
          user_id: userId,
          status,
          total_amount: totalAmount,
          currency,
          shipping_address: shippingAddress,
          billing_address: billingAddress,
          contact_phone: contactPhone,
          contact_email: contactEmail,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          metadata,
        })
        .select()
        .single();

      if (orderError) {
        throw new Error(`Failed to create order: ${orderError.message}`);
      }

      // Create order items
      const orderItems = items.map((item) => ({
        id: uuidv4(),
        order_id: orderId,
        product_id: item.productId,
        variant_id: item.variantId,
        sku: item.sku,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        product_snapshot: item.productSnapshot,
        retailer_id: item.retailerId,
      }));

      const { error: itemsError } = await this.supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        // Rollback: delete the order if items creation failed
        await this.supabase.from("orders").delete().eq("id", orderId);
        throw new Error(`Failed to create order items: ${itemsError.message}`);
      }

      // Return the created order
      return {
        id: orderId,
        orderNumber,
        userId,
        status,
        totalAmount: parseFloat(totalAmount),
        currency,
        shippingAddress,
        billingAddress,
        contactPhone,
        contactEmail,
        paymentMethod,
        paymentStatus,
        metadata,
        items,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error("Failed to create order:", error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Create a new order (legacy method - kept for compatibility)
   */
  async create(orderData) {
    const {
      userId,
      items,
      shippingAddress,
      billingAddress,
      contactPhone,
      contactEmail,
      paymentMethod,
    } = orderData;

    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 6)}`;

    return this.executeTransaction(async (connection) => {
      // Calculate total amount
      let totalAmount = 0;
      for (const item of items) {
        // Get product/variant price
        const { data: productRows, error: productError } = await connection
          .from("products")
          .select("base_price, product_variants(price)")
          .eq("id", item.productId)
          .single();

        if (productError || !productRows) {
          throw new Error(`Product ${item.productId} not found`);
        }

        const price =
          productRows.product_variants?.price || productRows.base_price;
        totalAmount += price * item.quantity;
      }

      // Create order
      const { error: orderError } = await connection.from("orders").insert({
        id: orderId,
        order_number: orderNumber,
        user_id: userId,
        total_amount: totalAmount,
        currency: "INR",
        shipping_address: shippingAddress,
        billing_address: billingAddress || shippingAddress,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        payment_method: paymentMethod,
      });

      if (orderError) {
        throw new Error(`Failed to create order: ${orderError.message}`);
      }

      // Create order items
      for (const item of items) {
        const { data: productRows, error: productError } = await connection
          .from("products")
          .select("*, product_variants(price, sku as variant_sku)")
          .eq("id", item.productId)
          .single();

        const product = productRows;
        const unitPrice = product.product_variants?.price || product.base_price;
        const totalPrice = unitPrice * item.quantity;
        const sku = product.product_variants?.variant_sku || product.sku;

        const { error: itemError } = await connection
          .from("order_items")
          .insert({
            id: uuidv4(),
            order_id: orderId,
            product_id: item.productId,
            variant_id: item.variantId,
            sku,
            title: product.title,
            quantity: item.quantity,
            unit_price: unitPrice,
            total_price: totalPrice,
            product_snapshot: {
              title: product.title,
              description: product.short_description,
              productType: product.product_type,
              basePrice: product.base_price,
            },
          });

        if (itemError) {
          throw new Error(`Failed to create order item: ${itemError.message}`);
        }
      }

      // Create initial order event
      const { error: eventError } = await connection
        .from("order_events")
        .insert({
          id: uuidv4(),
          order_id: orderId,
          new_status: "initialized",
          note: "Order created",
        });

      if (eventError) {
        throw new Error(`Failed to create order event: ${eventError.message}`);
      }

      return this.findById(orderId);
    });
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(orderId, paymentStatus, paymentData = {}) {
    try {
      const { data, error } = await this.supabase
        .from("orders")
        .update({
          payment_status: paymentStatus,
          payment_data: paymentData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update payment status: ${error.message}`);
      }

      // Create payment event
      await this.supabase.from("order_events").insert({
        id: uuidv4(),
        order_id: orderId,
        new_status: "payment_updated",
        note: `Payment status updated to ${paymentStatus}`,
        metadata: { paymentStatus, paymentData },
      });

      return await this.findById(orderId);
    } catch (error) {
      logger.error("Failed to update payment status:", error);
      throw error;
    }
  }

  /**
   * Get order statistics
   */
  async getStatistics(userId = null, filters = {}) {
    try {
      const { startDate, endDate } = filters;

      let query = this.supabase.from("orders").select("*");

      if (userId) query = query.eq("user_id", userId);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);

      const { data: orders, error } = await query;

      if (error) {
        throw new Error(`Failed to get order statistics: ${error.message}`);
      }

      const stats = {
        summary: {
          totalOrders: orders?.length || 0,
          totalRevenue:
            orders?.reduce(
              (sum, order) => sum + parseFloat(order.total_amount || 0),
              0
            ) || 0,
          averageOrderValue: 0,
          uniqueCustomers:
            new Set(orders?.map((order) => order.user_id)).size || 0,
        },
        byStatus: {},
        byPaymentMethod: {},
      };

      // Calculate average order value
      if (stats.summary.totalOrders > 0) {
        stats.summary.averageOrderValue =
          stats.summary.totalRevenue / stats.summary.totalOrders;
      }

      // Group by status
      orders?.forEach((order) => {
        const status = order.status;
        if (!stats.byStatus[status]) {
          stats.byStatus[status] = { count: 0, revenue: 0 };
        }
        stats.byStatus[status].count++;
        stats.byStatus[status].revenue += parseFloat(order.total_amount || 0);
      });

      // Group by payment method
      orders?.forEach((order) => {
        const method = order.payment_method;
        if (!stats.byPaymentMethod[method]) {
          stats.byPaymentMethod[method] = { count: 0, revenue: 0 };
        }
        stats.byPaymentMethod[method].count++;
        stats.byPaymentMethod[method].revenue += parseFloat(
          order.total_amount || 0
        );
      });

      return stats;
    } catch (error) {
      logger.error("Error getting order statistics:", error);
      throw error;
    }
  }

  /**
   * Find order by ID
   */
  async findById(orderId) {
    try {
      const { data: orderData, error: orderError } = await this.supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderError) {
        if (orderError.code === "PGRST116") return null; // No rows found
        throw orderError;
      }

      if (!orderData) return null;

      const order = this._formatOrder(orderData);

      // Get order items
      order.items = await this._getOrderItems(orderId);

      // Get order events
      order.events = await this._getOrderEvents(orderId);

      return order;
    } catch (error) {
      logger.error("Error finding order by ID:", error);
      throw error;
    }
  }

  /**
   * Search orders with filters
   */
  async search(filters) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        userId,
        paymentStatus,
        startDate,
        endDate,
        sortBy = "created_at",
        sortOrder = "desc",
        searchTerm,
      } = filters;

      const offset = (page - 1) * limit;

      // Valid order statuses from the database enum
      const validOrderStatuses = ["initialized", "processed", "shipped", "out_for_delivery", "delivered", "cancelled", "refunded"];

      let query = this.supabase.from("orders").select("*");

      // Apply filters - validate status against enum values
      if (status && validOrderStatuses.includes(status)) query = query.eq("status", status);
      if (userId) query = query.eq("user_id", userId);
      if (paymentStatus) query = query.eq("payment_status", paymentStatus);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);

      if (searchTerm) {
        query = query.or(
          `order_number.ilike.%${searchTerm}%,contact_email.ilike.%${searchTerm}%,contact_phone.ilike.%${searchTerm}%`
        );
      }

      // Apply sorting and pagination
      const ascending = sortOrder.toLowerCase() === "asc";
      query = query
        .order(sortBy, { ascending })
        .range(offset, offset + limit - 1);

      const { data: orders, error, count } = await query;

      if (error) {
        throw new Error(`Failed to search orders: ${error.message}`);
      }

      const formattedOrders = await Promise.all(
        (orders || []).map(async (order) => {
          const formattedOrder = this._formatOrder(order);
          formattedOrder.items = await this._getOrderItems(order.id);
          return formattedOrder;
        })
      );

      return {
        orders: formattedOrders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(count || 0),
          totalPages: Math.ceil((count || 0) / limit),
          hasNext: page < Math.ceil((count || 0) / limit),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error("Error searching orders:", error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateStatus(orderId, status, metadata = {}) {
    try {
      // Get current status first
      const { data: currentOrder, error: fetchError } = await this.supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();

      if (fetchError) {
        throw new Error(`Order not found: ${fetchError.message}`);
      }

      const previousStatus = currentOrder.status;

      // Update order status
      const { data, error } = await this.supabase
        .from("orders")
        .update({
          status,
          metadata: { ...currentOrder.metadata, ...metadata },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update order status: ${error.message}`);
      }

      return await this.findById(orderId);
    } catch (error) {
      logger.error("Failed to update order status:", error);
      throw error;
    }
  }

  /**
   * Get user orders
   */
  async getByUser(userId, filters = {}) {
    try {
      const { status, limit = 50, page = 1 } = filters;
      const offset = (page - 1) * limit;

      // Valid order statuses from the database enum
      const validOrderStatuses = ["initialized", "processed", "shipped", "out_for_delivery", "delivered", "cancelled", "refunded"];

      let query = this.supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId);
        

      // Only apply status filter if it's a valid enum value
      if (status && validOrderStatuses.includes(status)) {
        query = query.eq("status", status);
      }

      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: orders, error, count } = await query;

      if (error) {
        throw new Error(`Failed to get user orders: ${error.message}`);
      }

      logger.info("Raw orders fetched from DB", {
        userId,
        ordersCount: orders?.length || 0,
        orders: orders,
      });

      const formattedOrders = await Promise.all(
        (orders || []).map(async (order) => {
          const formattedOrder = this._formatOrder(order);
          formattedOrder.items = await this._getOrderItems(order.id);
          return formattedOrder;
        })
      );

      logger.info("Formatted orders", {
        userId,
        formattedOrdersCount: formattedOrders.length,
      });

      // Get total count
      let countQuery = this.supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      // Apply status filter if valid
      if (status && validOrderStatuses.includes(status)) {
        countQuery = countQuery.eq("status", status);
      }

      const { count: totalCount, error: countError } = await countQuery;

      const total = totalCount || 0;

      return {
        orders: formattedOrders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total),
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error("Error getting user orders:", error);
      throw error;
    }
  }

  /**
   * Get order items
   */
  async _getOrderItems(orderId) {
    try {
      const { data: items, error } = await this.supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("Error getting order items:", error);
        return [];
      }

      return (items || []).map(this._formatOrderItem);
    } catch (error) {
      logger.error("Error getting order items:", error);
      return [];
    }
  }

  /**
   * Get order events
   */
  async _getOrderEvents(orderId) {
    try {
      const { data: events, error } = await this.supabase
        .from("order_events")
        .select(
          `
          *,
          users!changed_by(full_name)
        `
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("Error getting order events:", error);
        return [];
      }

      return (events || []).map(this._formatOrderEvent);
    } catch (error) {
      logger.error("Error getting order events:", error);
      return [];
    }
  }

  /**
   * Format order object for response
   */
  _formatOrder(row) {
    return {
      id: row.id,
      orderNumber: row.order_number,
      userId: row.user_id,
      status: row.status,
      totalAmount: parseFloat(row.total_amount || 0),
      currency: row.currency || "INR",
      shippingAddress: row.shipping_address,
      billingAddress: row.billing_address,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status || "pending",
      paymentData: row.payment_data,
      retailerId: row.retailer_id,
      metadata: row.metadata || {},
      trackingNumber: row.tracking_number,
      estimatedDeliveryDate: row.estimated_delivery_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Format order item object for response
   */
  _formatOrderItem(row) {
    return {
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      sku: row.sku,
      title: row.title,
      quantity: parseInt(row.quantity || 0),
      unitPrice: parseFloat(row.unit_price || 0),
      totalPrice: parseFloat(row.total_price || 0),
      productSnapshot: row.product_snapshot || {},
      retailerId: row.retailer_id,
      createdAt: row.created_at,
    };
  }

  /**
   * Format order event object for response
   */
  _formatOrderEvent(row) {
    return {
      id: row.id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      changedBy: row.changed_by,
      changedByName: row.users?.full_name,
      note: row.note,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    };
  }
}
