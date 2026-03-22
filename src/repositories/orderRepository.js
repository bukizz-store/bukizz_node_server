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
    this.LOCK_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes soft-lock
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
      // Determine warehouse_id from the first item that has one
      const orderWarehouseId =
        items.find((item) => item.warehouseId)?.warehouseId || null;

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
          warehouse_id: orderWarehouseId,
          metadata,
        })
        .select()
        .single();

      if (orderError) {
        throw new Error(`Failed to create order: ${orderError.message}`);
      }

      // Pre-generate UUIDs to map parent-child relationships correctly
      const idMap = new Map();
      items.forEach((item) => {
        if (item.clientId) {
          idMap.set(item.clientId, uuidv4());
        }
      });

      // Create order items
      const orderItems = items.map((item) => {
        const itemId = item.clientId && idMap.has(item.clientId) ? idMap.get(item.clientId) : uuidv4();
        const parentId = item.parentClientId && idMap.has(item.parentClientId) ? idMap.get(item.parentClientId) : null;

        return {
          id: itemId,
          order_id: orderId,
          parent_item_id: parentId,
          product_id: item.productId,
          variant_id: item.variantId,
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          delivery_fee: item.itemDeliveryFee || 0,
          platform_fee: item.itemPlatformFee || 0,
          product_snapshot: item.productSnapshot,
          warehouse_id: item.warehouseId,
          status: status, // Initialize with order status or defaults
        };
      });

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

      // COD orders skip 'initialized' and go directly to 'processed'
      const orderStatus = paymentMethod === "cod" ? "processed" : "initialized";

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
        status: orderStatus,
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
              productType: product.product_type,
              basePrice: product.base_price,
            },
            status: orderStatus,
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
          new_status: orderStatus,
          note: paymentMethod === "cod" ? "COD order created and processed" : "Order created",
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
              0,
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
          order.total_amount || 0,
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
      console.log("order", order);

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
        search, // alias used by admin frontend
        retailerId,
        warehouseId,
        city,
      } = filters;

      const effectiveSearchTerm = searchTerm || search;

      const offset = (page - 1) * parseInt(limit);

      // Valid order statuses from the database enum
      const validOrderStatuses = [
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
      ];

      const isUUID = (str) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      // ── Resolve specific matching order IDs from Items and Orders ──────
      let warehouseIds = null;
      if (warehouseId) {
        warehouseIds = [warehouseId];
      } else if (retailerId) {
        const { data: retailerWarehouses } = await this.supabase
          .from("warehouses")
          .select("id")
          .eq("user_id", retailerId);
        if (retailerWarehouses && retailerWarehouses.length > 0) {
          warehouseIds = retailerWarehouses.map((w) => w.id);
        } else {
          return {
            orders: [],
            pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          };
        }
      }

      let validOrderIdsByItemFilters = null;
      let validOrderIdsBySearch = null;

      // 1. Resolve order IDs based on item-level filters (warehouse and status)
      // Because retailers manage items, the status and warehouse filters should apply to items
      if (warehouseIds || (status && validOrderStatuses.includes(status))) {
        let itemQuery = this.supabase.from("order_items").select("order_id");
        let orderQuery = this.supabase.from("orders").select("id"); // Orders that directly hold the warehouse_id

        if (warehouseIds) {
          itemQuery = itemQuery.in("warehouse_id", warehouseIds);
          orderQuery = orderQuery.in("warehouse_id", warehouseIds);
        }
        if (status && validOrderStatuses.includes(status)) {
          itemQuery = itemQuery.eq("status", status);
          orderQuery = orderQuery.eq("status", status); // Also filter orders table for fallback
        }

        const [{ data: itemRows }, { data: orderRows }] = await Promise.all([
          itemQuery,
          orderQuery,
        ]);

        validOrderIdsByItemFilters = [
          ...new Set([
            ...(itemRows || []).map((i) => i.order_id),
            ...(orderRows || []).map((o) => o.id),
          ]),
        ];

        // If filtering by warehouse/status but no items/orders match, return empty
        if (validOrderIdsByItemFilters.length === 0) {
          return {
            orders: [],
            pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          };
        }
      }

      // 2. Resolve order IDs based on search term
      if (effectiveSearchTerm) {
        const searchOrderIds = new Set();
        const searchPromises = [];

        // Search orders table
        const safeSearch = effectiveSearchTerm.replace(/"/g, '""');
        const orderSearchQuery = this.supabase.from("orders").select("id").or(
          `order_number.ilike."%${safeSearch}%",contact_email.ilike."%${safeSearch}%",contact_phone.ilike."%${safeSearch}%"`
        );
        searchPromises.push(orderSearchQuery);

        // Search item dispatch id
        searchPromises.push(
          this.supabase.from("order_items").select("order_id").ilike("dispatch_id", `%${effectiveSearchTerm}%`)
        );

        // If UUID, search direct IDs
        if (isUUID(effectiveSearchTerm)) {
          searchPromises.push(this.supabase.from("orders").select("id").eq("id", effectiveSearchTerm));
          searchPromises.push(this.supabase.from("order_items").select("order_id").eq("id", effectiveSearchTerm));
          searchPromises.push(this.supabase.from("orders").select("id").eq("warehouse_id", effectiveSearchTerm));
          searchPromises.push(this.supabase.from("order_items").select("order_id").eq("warehouse_id", effectiveSearchTerm));
        }

        const searchResults = await Promise.all(searchPromises);

        for (const { data } of searchResults) {
          if (data) {
            data.forEach(row => searchOrderIds.add(row.id || row.order_id));
          }
        }

        validOrderIdsBySearch = Array.from(searchOrderIds);

        // If searching but no results, return empty
        if (validOrderIdsBySearch.length === 0) {
          return {
            orders: [],
            pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          };
        }
      }

      // 3. Intersect valid order IDs if both search and filters were applied
      let finalOrderIds = null;
      if (validOrderIdsByItemFilters !== null && validOrderIdsBySearch !== null) {
        finalOrderIds = validOrderIdsByItemFilters.filter(id => validOrderIdsBySearch.includes(id));
      } else if (validOrderIdsByItemFilters !== null) {
        finalOrderIds = validOrderIdsByItemFilters;
      } else if (validOrderIdsBySearch !== null) {
        finalOrderIds = validOrderIdsBySearch;
      }

      // If we had conditions but their intersection is empty
      if ((validOrderIdsByItemFilters !== null || validOrderIdsBySearch !== null) &&
        (!finalOrderIds || finalOrderIds.length === 0)) {
        return {
          orders: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        };
      }

      // ── Build main query ────────────────────────────────────────────────────
      let query = this.supabase.from("orders").select("*", { count: "exact" });

      if (userId) query = query.eq("user_id", userId);
      if (paymentStatus) query = query.eq("payment_status", paymentStatus);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);
      if (finalOrderIds) query = query.in("id", finalOrderIds);
      if (city) query = query.ilike("shipping_address->>city", `%${city}%`);

      // Apply sorting and pagination
      const ascending = sortOrder.toLowerCase() === "asc";
      query = query
        .order(sortBy, { ascending })
        .range(offset, offset + parseInt(limit) - 1);

      const { data: orders, error, count } = await query;

      if (error) {
        throw new Error(`Failed to search orders: ${error.message}`);
      }

      // Batch fetch items for all orders to avoid N+1 problem
      const orderIds = (orders || []).map((o) => o.id);

      const itemsFilters = {
        warehouseIds,
        status: (status && validOrderStatuses.includes(status)) ? status : null
      };

      const itemsMap = await this._getItemsForOrders(orderIds, itemsFilters);

      const formattedOrders = (orders || []).map((order) => {
        const formattedOrder = this._formatOrder(order);
        formattedOrder.items = itemsMap[order.id] || [];
        return formattedOrder;
      });

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
      const validOrderStatuses = [
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
      ];

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
      });

      // Batch fetch items for all orders to avoid N+1 problem
      const orderIds = (orders || []).map((o) => o.id);
      const itemsMap = await this._getItemsForOrders(orderIds);

      const formattedOrders = (orders || []).map((order) => {
        const formattedOrder = this._formatOrder(order);
        formattedOrder.items = itemsMap[order.id] || [];
        return formattedOrder;
      });

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
   * Update order item status
   */
  async updateOrderItemStatus(itemId, status) {
    try {
      const { data, error } = await this.supabase
        .from("order_items")
        .update({
          status,
        })
        .eq("id", itemId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update order item status: ${error.message}`);
      }

      return this._formatOrderItem(data);
    } catch (error) {
      logger.error("Failed to update order item status:", error);
      throw error;
    }
  }

  /**
   * Get items for multiple orders (Batch Fetch)
   */
  async _getItemsForOrders(orderIds, filters = {}) {
    if (!orderIds || orderIds.length === 0) return {};

    try {
      let query = this.supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);

      if (filters.warehouseIds && filters.warehouseIds.length > 0) {
        query = query.in("warehouse_id", filters.warehouseIds);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      const { data: items, error } = await query.order("created_at", { ascending: true });

      if (error) {
        logger.error("Error getting batch order items:", error);
        return {};
      }

      const allFormatted = (items || []).map(this._formatOrderItem.bind(this));
      console.log("allFormatted", allFormatted);
      const enrichedWithVariants =
        await this._enrichItemsWithVariantData(allFormatted);
      const enriched =
        await this._enrichItemsWithSchoolData(enrichedWithVariants);

      // Group by order_id
      const itemsMap = {};
      enriched.forEach((item) => {
        if (!itemsMap[item.orderId || item._orderId])
          itemsMap[item.orderId || item._orderId] = [];
        itemsMap[item.orderId || item._orderId].push(item);
      });

      return itemsMap;
    } catch (error) {
      logger.error("Error getting batch order items:", error);
      return {};
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

      const formatted = (items || []).map(this._formatOrderItem.bind(this));
      const enrichedWithVariants =
        await this.enrichItemsWithVariantData(formatted);
      return await this._enrichItemsWithSchoolData(enrichedWithVariants);
    } catch (error) {
      logger.error("Error getting order items:", error);
      return [];
    }
  }

  /**
   * Enrich order items with full variant data (option values + attributes)
   * Batch-fetches all variant IDs in one query to avoid N+1
   */
  async enrichItemsWithVariantData(items) {
    try {
      const variantIds = items.map((item) => item.variantId).filter(Boolean);

      if (variantIds.length === 0) return items;

      // Fetch variants with nested option values and their attributes
      const { data: variants, error } = await this.supabase
        .from("product_variants")
        .select(
          `
          id, sku, price, compare_at_price, stock, weight, metadata,
          option_value_1, option_value_2, option_value_3
        `,
        )
        .in("id", variantIds);

      if (error || !variants || variants.length === 0) {
        logger.warn("Could not fetch variant data for enrichment:", error);
        return items;
      }

      // Collect all option_value UUIDs across all variants
      const optionValueIds = new Set();
      variants.forEach((v) => {
        if (v.option_value_1) optionValueIds.add(v.option_value_1);
        if (v.option_value_2) optionValueIds.add(v.option_value_2);
        if (v.option_value_3) optionValueIds.add(v.option_value_3);
      });

      // Batch-fetch option values with their attribute info
      let optionValueMap = {};
      if (optionValueIds.size > 0) {
        const { data: optionValues, error: ovError } = await this.supabase
          .from("product_option_values")
          .select(
            `
            id, value, sort_order, image_url,
            attribute:attribute_id (
              id, name, position, is_required
            )
          `,
          )
          .in("id", [...optionValueIds]);

        if (!ovError && optionValues) {
          optionValues.forEach((ov) => {
            optionValueMap[ov.id] = {
              id: ov.id,
              value: ov.value,
              imageUrl: ov.image_url,
              sortOrder: ov.sort_order,
              attribute: ov.attribute
                ? {
                  id: ov.attribute.id,
                  name: ov.attribute.name,
                  position: ov.attribute.position,
                }
                : null,
            };
          });
        }
      }

      // Build a variant lookup map
      const variantMap = {};
      variants.forEach((v) => {
        const options = [];
        if (v.option_value_1 && optionValueMap[v.option_value_1]) {
          options.push(optionValueMap[v.option_value_1]);
        }
        if (v.option_value_2 && optionValueMap[v.option_value_2]) {
          options.push(optionValueMap[v.option_value_2]);
        }
        if (v.option_value_3 && optionValueMap[v.option_value_3]) {
          options.push(optionValueMap[v.option_value_3]);
        }

        variantMap[v.id] = {
          id: v.id,
          sku: v.sku,
          price: parseFloat(v.price || 0),
          compareAtPrice: v.compare_at_price
            ? parseFloat(v.compare_at_price)
            : null,
          stock: v.stock,
          weight: v.weight,
          metadata: v.metadata || {},
          options,
        };
      });

      // Attach variant data to each item
      return items.map((item) => ({
        ...item,
        variant: item.variantId ? variantMap[item.variantId] || null : null,
      }));
    } catch (error) {
      logger.error("Error enriching items with variant data:", error);
      return items; // Return items without variant data on failure
    }
  }

  /**
   * Enrich order items with full variant data (option values + attributes)
   * Batch-fetches all variant IDs in one query to avoid N+1
   */
  async _enrichItemsWithVariantData(items) {
    try {
      const variantIds = items.map((item) => item.variantId).filter(Boolean);

      if (variantIds.length === 0) return items;

      // Fetch variants with nested option values and their attributes
      const { data: variants, error } = await this.supabase
        .from("product_variants")
        .select(
          `
          id, sku, price, compare_at_price, stock, weight, metadata,
          option_value_1, option_value_2, option_value_3
        `,
        )
        .in("id", variantIds);

      if (error || !variants || variants.length === 0) {
        logger.warn("Could not fetch variant data for enrichment:", error);
        return items;
      }

      // Collect all option_value UUIDs across all variants
      const optionValueIds = new Set();
      variants.forEach((v) => {
        if (v.option_value_1) optionValueIds.add(v.option_value_1);
        if (v.option_value_2) optionValueIds.add(v.option_value_2);
        if (v.option_value_3) optionValueIds.add(v.option_value_3);
      });

      // Batch-fetch option values with their attribute info
      let optionValueMap = {};
      if (optionValueIds.size > 0) {
        const { data: optionValues, error: ovError } = await this.supabase
          .from("product_option_values")
          .select(
            `
            id, value, sort_order, image_url,
            attribute:attribute_id (
              id, name, position, is_required
            )
          `,
          )
          .in("id", [...optionValueIds]);

        if (!ovError && optionValues) {
          optionValues.forEach((ov) => {
            optionValueMap[ov.id] = {
              id: ov.id,
              value: ov.value,
              imageUrl: ov.image_url,
              sortOrder: ov.sort_order,
              attribute: ov.attribute
                ? {
                  id: ov.attribute.id,
                  name: ov.attribute.name,
                  position: ov.attribute.position,
                }
                : null,
            };
          });
        }
      }

      // Build a variant lookup map
      const variantMap = {};
      variants.forEach((v) => {
        const options = [];
        if (v.option_value_1 && optionValueMap[v.option_value_1]) {
          options.push(optionValueMap[v.option_value_1]);
        }
        if (v.option_value_2 && optionValueMap[v.option_value_2]) {
          options.push(optionValueMap[v.option_value_2]);
        }
        if (v.option_value_3 && optionValueMap[v.option_value_3]) {
          options.push(optionValueMap[v.option_value_3]);
        }

        variantMap[v.id] = {
          id: v.id,
          sku: v.sku,
          price: parseFloat(v.price || 0),
          compareAtPrice: v.compare_at_price
            ? parseFloat(v.compare_at_price)
            : null,
          stock: v.stock,
          weight: v.weight,
          metadata: v.metadata || {},
          options,
        };
      });

      // Attach variant data to each item
      return items.map((item) => ({
        ...item,
        variant: item.variantId ? variantMap[item.variantId] || null : null,
      }));
    } catch (error) {
      logger.error("Error enriching items with variant data:", error);
      return items; // Return items without variant data on failure
    }
  }

  /**
   * Enrich order items with school names
   */
  async _enrichItemsWithSchoolData(items) {
    try {
      if (!items || items.length === 0) return items;

      const productIds = Array.from(
        new Set(items.map((item) => item.productId).filter(Boolean)),
      );
      if (productIds.length === 0) return items;

      const { data: schoolLinks, error: schoolError } = await this.supabase
        .from("product_schools")
        .select(
          `
          product_id,
          schools (name)
        `,
        )
        .in("product_id", productIds);

      if (schoolError) {
        logger.error(
          "Error fetching schools for item enrichment:",
          schoolError,
        );
        return items;
      }

      const schoolMap = {};
      if (schoolLinks) {
        schoolLinks.forEach((link) => {
          if (link.schools?.name) {
            schoolMap[link.product_id] = link.schools.name;
          }
        });
      }

      return items.map((item) => ({
        ...item,
        schoolName: schoolMap[item.productId] || null,
      }));
    } catch (error) {
      logger.error("Error enriching items with school data:", error);
      return items;
    }
  }

  /**
   * Find a single order item by ID
   */
  async findOrderItemById(itemId) {
    try {
      const { data: item, error } = await this.supabase
        .from("order_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }

      if (!item) return null;

      const formatted = this._formatOrderItem(item);
      const enrichedWithVariants = await this.enrichItemsWithVariantData([
        formatted,
      ]);
      const enriched =
        await this._enrichItemsWithSchoolData(enrichedWithVariants);
      return enriched[0];
    } catch (error) {
      logger.error("Error finding order item by ID:", error);
      throw error;
    }
  }

  /**
   * Get events for a specific order item
   */
  async getOrderItemEvents(itemId) {
    try {
      const { data: events, error } = await this.supabase
        .from("order_events")
        .select(
          `
          *,
          users!changed_by(full_name)
        `,
        )
        .eq("order_item_id", itemId)
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("Error getting order item events:", error);
        return [];
      }

      return (events || []).map(this._formatOrderEvent);
    } catch (error) {
      logger.error("Error getting order item events:", error);
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
        `,
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
   * Get orders by warehouse ID with filters and pagination
   * Used by retailer portal to view orders for a specific warehouse
   */
  async getByWarehouseId(warehouseId, filters = {}) {
    try {
      const {
        status,
        limit = 20,
        page = 1,
        startDate,
        endDate,
        sortBy = "created_at",
        sortOrder = "desc",
        searchTerm,
        paymentStatus,
      } = filters;

      const offset = (page - 1) * limit;
      const validOrderStatuses = [
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
      ];

      // ITEM-FIRST approach: status lives on order_items, not orders.
      // Step 1a: Get order IDs from items directly assigned to this warehouse
      let itemQuery = this.supabase
        .from("order_items")
        .select("order_id")
        .eq("warehouse_id", warehouseId);

      if (status && validOrderStatuses.includes(status)) {
        itemQuery = itemQuery.eq("status", status);
      } else {
        // Always exclude initialized orders for retailer/warehouse APIs
        itemQuery = itemQuery.neq("status", "initialized");
      }

      const { data: matchedItems, error: itemError } = await itemQuery;

      if (itemError) {
        throw new Error(
          `Failed to fetch warehouse order items: ${itemError.message}`,
        );
      }

      // Step 1b: Fallback — orders with warehouse_id at order level (for items with NULL warehouse_id)
      const { data: fallbackOrders } = await this.supabase
        .from("orders")
        .select("id")
        .eq("warehouse_id", warehouseId)
        .neq("status", "initialized");
      const fallbackOrderIds = (fallbackOrders || []).map((o) => o.id);

      // If status filter is active, further filter fallback orders
      // by checking if they have ANY item with that status
      let filteredFallbackIds = fallbackOrderIds;
      if (
        status &&
        validOrderStatuses.includes(status) &&
        fallbackOrderIds.length > 0
      ) {
        const { data: fallbackItems } = await this.supabase
          .from("order_items")
          .select("order_id")
          .in("order_id", fallbackOrderIds)
          .eq("status", status);
        filteredFallbackIds = (fallbackItems || []).map((i) => i.order_id);
      }

      const orderIdsFromItems = (matchedItems || []).map(
        (item) => item.order_id,
      );
      const orderIds = [
        ...new Set([...orderIdsFromItems, ...filteredFallbackIds]),
      ];

      if (orderIds.length === 0) {
        return {
          orders: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        };
      }

      // 2. Fetch the parent orders (no status filter here — status is on items)
      let query = this.supabase
        .from("orders")
        .select("*", { count: "exact" })
        .in("id", orderIds)
        .neq("status", "initialized");

      if (paymentStatus) query = query.eq("payment_status", paymentStatus);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);

      if (searchTerm) {
        query = query.or(
          `order_number.ilike."%${searchTerm.replace(/"/g, '""')}%",contact_email.ilike."%${searchTerm.replace(/"/g, '""')}%",contact_phone.ilike."%${searchTerm.replace(/"/g, '""')}%"`,
        );
      }

      const ascending = sortOrder.toLowerCase() === "asc";
      query = query
        .order(sortBy, { ascending })
        .range(offset, offset + limit - 1);

      const { data: orders, error, count } = await query;

      if (error) {
        throw new Error(`Failed to fetch warehouse orders: ${error.message}`);
      }

      // 3. Batch fetch items for all orders (only items for this warehouse)
      const fetchedOrderIds = (orders || []).map((o) => o.id);
      const itemsMap = await this._getWarehouseItemsForOrders(
        fetchedOrderIds,
        warehouseId,
      );

      const formattedOrders = (orders || []).map((order) => {
        const formattedOrder = this._formatOrder(order);
        formattedOrder.items = itemsMap[order.id] || [];
        return formattedOrder;
      });

      const total = count || 0;

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
      logger.error("Error getting orders by warehouse ID:", error);
      throw error;
    }
  }

  /**
   * Get orders for multiple warehouses belonging to a retailer
   * Aggregates orders across all warehouses owned by the retailer
   */
  async getByWarehouseIds(warehouseIds, filters = {}) {
    try {
      const {
        status,
        limit = 20,
        page = 1,
        startDate,
        endDate,
        sortBy = "created_at",
        sortOrder = "desc",
        searchTerm,
        paymentStatus,
        validOrderStatuses = [
          "initialized",
          "processed",
          "shipped",
          "out_for_delivery",
          "delivered",
          "cancelled",
          "refunded",
        ],
      } = filters;

      const offset = (page - 1) * limit;

      if (!warehouseIds || warehouseIds.length === 0) {
        return {
          orders: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        };
      }

      // ITEM-FIRST approach: status lives on order_items, not orders.
      // Step 1a: Get order IDs from items directly assigned to these warehouses
      let itemQuery = this.supabase
        .from("order_items")
        .select("order_id")
        .in("warehouse_id", warehouseIds);

      if (status && validOrderStatuses.includes(status)) {
        itemQuery = itemQuery.eq("status", status);
      } else {
        // Always exclude initialized orders for retailer/warehouse APIs
        itemQuery = itemQuery.neq("status", "initialized");
      }

      const { data: matchedItems, error: itemError } = await itemQuery;

      if (itemError) {
        throw new Error(
          `Failed to fetch warehouse order items: ${itemError.message}`,
        );
      }

      // Step 1b: Fallback — orders with warehouse_id at order level
      const { data: fallbackOrders } = await this.supabase
        .from("orders")
        .select("id")
        .in("warehouse_id", warehouseIds)
        .neq("status", "initialized");

      let filteredFallbackIds = (fallbackOrders || []).map((o) => o.id);
      if (
        status &&
        validOrderStatuses.includes(status) &&
        filteredFallbackIds.length > 0
      ) {
        const { data: fallbackItems } = await this.supabase
          .from("order_items")
          .select("order_id")
          .in("order_id", filteredFallbackIds)
          .eq("status", status);
        filteredFallbackIds = (fallbackItems || []).map((i) => i.order_id);
      }

      const orderIdsFromItems = (matchedItems || []).map(
        (item) => item.order_id,
      );
      const orderIds = [
        ...new Set([...orderIdsFromItems, ...filteredFallbackIds]),
      ];

      if (orderIds.length === 0) {
        return {
          orders: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        };
      }

      // 2. Fetch the parent orders (no status filter — status is on items)
      let query = this.supabase
        .from("orders")
        .select("*", { count: "exact" })
        .in("id", orderIds)
        .neq("status", "initialized");

      if (paymentStatus) query = query.eq("payment_status", paymentStatus);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);

      if (searchTerm) {
        query = query.or(
          `order_number.ilike."%${searchTerm.replace(/"/g, '""')}%",contact_email.ilike."%${searchTerm.replace(/"/g, '""')}%",contact_phone.ilike."%${searchTerm.replace(/"/g, '""')}%"`,
        );
      }

      const ascending = sortOrder.toLowerCase() === "asc";
      query = query
        .order(sortBy, { ascending })
        .range(offset, offset + limit - 1);

      const { data: orders, error, count } = await query;

      if (error) {
        throw new Error(`Failed to fetch retailer orders: ${error.message}`);
      }

      // Batch fetch items (only items belonging to retailer's warehouses)
      const fetchedOrderIds = (orders || []).map((o) => o.id);
      const itemsMap = await this._getWarehouseItemsForOrdersBulk(
        fetchedOrderIds,
        warehouseIds,
      );

      const formattedOrders = (orders || []).map((order) => {
        const formattedOrder = this._formatOrder(order);
        formattedOrder.items = itemsMap[order.id] || [];
        return formattedOrder;
      });

      const total = count || 0;

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
      logger.error("Error getting orders by warehouse IDs:", error);
      throw error;
    }
  }

  /**
   * Get available items for a warehouse for delivery partners
   * Handles soft-locking logic (45 mins)
   */
  async getAvailableWarehouseItems(warehouseId, partnerId, filters = {}) {
    try {
      const { status = "shipped", limit = 100, search, sortBy } = filters;
      const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();

      let query = this.supabase
        .from("order_items")
        .select(`
          *,
          orders!inner(
            id,
            order_number,
            shipping_address,
            contact_phone,
            contact_email,
            payment_method,
            total_amount
          )
        `)
        .eq("warehouse_id", warehouseId)
        .eq("status", status)
        .or(`locked_at.is.null,locked_at.lt.${fortyFiveMinsAgo},locked_by.eq.${partnerId}`);

      if (search) {
        query = query.ilike('orders.order_number', `%${search}%`);
      }

      if (sortBy === 'incentive') {
         query = query.order("created_at", { ascending: true });
      } else if (sortBy === 'newest') {
         query = query.order("created_at", { ascending: false });
      } else {
         query = query.order("created_at", { ascending: true });
      }
      
      query = query.limit(limit);

      const { data: items, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch available items: ${error.message}`);
      }

      const formattedItems = (items || []).map((item) => {
        const formatted = this._formatOrderItem(item);
        formatted.orderInfo = {
          id: item.orders.id,
          orderNumber: item.orders.order_number,
          shippingAddress: item.orders.shipping_address,
          contactPhone: item.orders.contact_phone,
          contactEmail: item.orders.contact_email,
          paymentMethod: item.orders.payment_method,
          orderTotalAmount: item.orders.total_amount,
        };
        return formatted;
      });

      return await this._enrichItemsWithVariantData(formattedItems);
    } catch (error) {
      logger.error("Error getting available warehouse items:", error);
      throw error;
    }
  }

  /**
   * Claim items for a delivery partner (Soft Lock)
   */
  async claimItems(itemIds, partnerId) {
    try {
      if (!itemIds || itemIds.length === 0) return [];
      const now = new Date().toISOString();
      const fortyFiveMinsAgo = new Date(Date.now() - this.LOCK_TIMEOUT_MS).toISOString();

      const { data, error } = await this.supabase
        .from("order_items")
        .update({
          locked_by: partnerId,
          locked_at: now
        })
        .in("id", itemIds)
        .eq("status", "shipped")
        .or(`locked_at.is.null,locked_at.lt.${fortyFiveMinsAgo},locked_by.eq.${partnerId}`)
        .select();

      if (error) {
        throw new Error(`Failed to claim items: ${error.message}`);
      }

      return data.map(this._formatOrderItem.bind(this));
    } catch (error) {
      logger.error("Error claiming items:", error);
      throw error;
    }
  }

  /**
   * Confirm pickup: verify the partner holds a valid lock on the item, then
   * transition status from shipped → out_for_delivery.
   * Returns the updated formatted item or throws.
   */
  async confirmPickupItem(itemId, orderId, partnerId) {
    try {
      // Verify the item belongs to the order, is shipped, and locked by this partner
      const { data: item, error: fetchError } = await this.supabase
        .from("order_items")
        .select("*")
        .eq("id", itemId)
        .eq("order_id", orderId)
        .eq("status", "shipped")
        .eq("locked_by", partnerId)
        .single();

      if (fetchError || !item) {
        throw new Error(
          "Item not found, not shipped, or not locked by you."
        );
      }

      // Check lock hasn't expired
      const lockAge = new Date() - new Date(item.locked_at);
      if (lockAge > this.LOCK_TIMEOUT_MS) {
        throw new Error("Your lock on this item has expired. Please re-claim it.");
      }

      // Update status to out_for_delivery
      const { data: updated, error: updateError } = await this.supabase
        .from("order_items")
        .update({ status: "out_for_delivery" })
        .eq("id", itemId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update item status: ${updateError.message}`);
      }

      const formatted = this._formatOrderItem(updated);
      const enriched = await this._enrichItemsWithVariantData([formatted]);
      return enriched[0];
    } catch (error) {
      logger.error("Error confirming pickup item:", error);
      throw error;
    }
  }

  /**
   * Mark an out_for_delivery item as delivered.
   * Validates: item exists, status is out_for_delivery, locked_by = partnerId.
   * Clears lock fields after delivery.
   */
  async markItemDelivered(itemId, partnerId, options = {}) {
    const { markPaymentPaid = false, paymentCollectionMethod = null } = options;
    try {
      const { data: item, error: fetchError } = await this.supabase
        .from("order_items")
        .select("*")
        .eq("id", itemId)
        .eq("status", "out_for_delivery")
        .eq("locked_by", partnerId)
        .single();

      if (fetchError || !item) {
        throw new Error(
          "Item not found, not out for delivery, or not assigned to you."
        );
      }

      const { data: updated, error: updateError } = await this.supabase
        .from("order_items")
        .update({
          status: "delivered",
          locked_by: null,
          locked_at: null,
        })
        .eq("id", itemId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to mark item as delivered: ${updateError.message}`);
      }

      // If cash collected at doorstep, mark order payment as paid
      if (markPaymentPaid && item.order_id) {
        const orderUpdate = {
          payment_status: "paid",
          updated_at: new Date().toISOString(),
        };

        // Record how payment was collected (cash / online)
        if (paymentCollectionMethod) {
          orderUpdate.payment_collection_method = paymentCollectionMethod;
        }

        const { error: payError } = await this.supabase
          .from("orders")
          .update(orderUpdate)
          .eq("id", item.order_id);

        if (payError) {
          logger.error("Failed to update payment status for COD order:", payError);
        }
      } else if (paymentCollectionMethod && item.order_id) {
        // Even for non-COD, record the collection method if provided
        const { error: methodError } = await this.supabase
          .from("orders")
          .update({
            payment_collection_method: paymentCollectionMethod,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.order_id);

        if (methodError) {
          logger.error("Failed to update payment collection method:", methodError);
        }
      }

      const formatted = this._formatOrderItem(updated);
      const enriched = await this._enrichItemsWithVariantData([formatted]);
      return { formatted: enriched[0], orderId: item.order_id };
    } catch (error) {
      logger.error("Error marking item as delivered:", error);
      throw error;
    }
  }

  /**
   * Get all out_for_delivery items assigned to a delivery partner.
   * Returns items with full order info (address, contact, payment).
   */
  async getActiveDeliveries(partnerId) {
    try {
      const { data: items, error } = await this.supabase
        .from("order_items")
        .select(`
          *,
          orders!inner(
            id,
            order_number,
            shipping_address,
            contact_phone,
            contact_email,
            payment_method,
            total_amount
          )
        `)
        .eq("status", "out_for_delivery")
        .eq("locked_by", partnerId)
        .order("locked_at", { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch active deliveries: ${error.message}`);
      }

      const activeWithInfo = (items || []).map((item) => {
        const formatted = this._formatOrderItem(item);
        formatted.orderInfo = {
          id: item.orders.id,
          orderNumber: item.orders.order_number,
          shippingAddress: item.orders.shipping_address,
          contactPhone: item.orders.contact_phone,
          contactEmail: item.orders.contact_email,
          paymentMethod: item.orders.payment_method,
          orderTotalAmount: item.orders.total_amount,
        };
        return formatted;
      });

      return await this._enrichItemsWithVariantData(activeWithInfo);
    } catch (error) {
      logger.error("Error fetching active deliveries:", error);
      throw error;
    }
  }

  /**
   * Count currently valid (non-expired) locks for a partner
   */
  async countValidLocks(partnerId) {
    try {
      const lockThreshold = new Date(Date.now() - this.LOCK_TIMEOUT_MS).toISOString();

      const { count, error } = await this.supabase
        .from("order_items")
        .select("*", { count: "exact", head: true })
        .eq("locked_by", partnerId)
        .gte("locked_at", lockThreshold);

      if (error) {
        throw new Error(`Failed to count valid locks: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      logger.error("Error counting valid locks:", error);
      throw error;
    }
  }

  /**
   * Get order statistics for a specific warehouse
   */
  async getWarehouseOrderStats(warehouseId, filters = {}) {
    try {
      const { startDate, endDate } = filters;

      // Get all order_items for this warehouse (status lives on items, not orders)
      const { data: warehouseOrderItems, error: itemError } =
        await this.supabase
          .from("order_items")
          .select(
            "order_id, unit_price, quantity, total_price, status, warehouse_id",
          )
          .or(`warehouse_id.eq.${warehouseId},warehouse_id.is.null`);

      if (itemError) {
        throw new Error(
          `Failed to fetch warehouse order items: ${itemError.message}`,
        );
      }

      // Also include items from orders that have warehouse_id set at the order level
      const { data: fallbackOrders } = await this.supabase
        .from("orders")
        .select("id")
        .eq("warehouse_id", warehouseId)
        .neq("status", "initialized");
      const fallbackOrderIds = new Set((fallbackOrders || []).map((o) => o.id));

      // For NULL-warehouse items, only include if the parent order belongs to this warehouse
      const relevantItems = (warehouseOrderItems || []).filter((item) => {
        // Always exclude initialized items
        if (item.status === "initialized") return false;

        // Directly assigned to this warehouse
        if (item.warehouse_id === warehouseId) return true;
        // NULL warehouse but order belongs to this warehouse
        if (!item.warehouse_id && fallbackOrderIds.has(item.order_id))
          return true;
        return false;
      });

      const orderIds = [...new Set(relevantItems.map((item) => item.order_id))];

      if (orderIds.length === 0) {
        return {
          summary: {
            totalOrders: 0,
            totalRevenue: 0,
            averageOrderValue: 0,
            totalItems: 0,
          },
          byStatus: {},
          byPaymentStatus: {},
        };
      }

      // Date filtering is applied at the order level
      let query = this.supabase.from("orders").select("*").in("id", orderIds).neq("status", "initialized");
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);

      const { data: orders, error } = await query;

      if (error) {
        throw new Error(
          `Failed to get warehouse order stats: ${error.message}`,
        );
      }

      // Only count items that belong to date-filtered orders
      const filteredOrderIds = new Set((orders || []).map((o) => o.id));
      const filteredItems = relevantItems.filter((i) =>
        filteredOrderIds.has(i.order_id),
      );

      // Calculate warehouse-specific revenue from order_items
      const warehouseRevenue = filteredItems.reduce(
        (sum, item) => sum + parseFloat(item.total_price || 0),
        0,
      );

      const totalItems = filteredItems.reduce(
        (sum, item) => sum + parseInt(item.quantity || 0),
        0,
      );

      const stats = {
        summary: {
          totalOrders: orders?.length || 0,
          totalRevenue: parseFloat(warehouseRevenue.toFixed(2)),
          averageOrderValue:
            orders?.length > 0
              ? parseFloat((warehouseRevenue / orders.length).toFixed(2))
              : 0,
          totalItems,
        },
        byStatus: {},
        byPaymentStatus: {},
      };

      // byStatus is computed from ITEM-level statuses (source of truth)
      filteredItems.forEach((item) => {
        const itemStatus = item.status || "initialized";
        if (!stats.byStatus[itemStatus]) {
          stats.byStatus[itemStatus] = { count: 0, revenue: 0 };
        }
        stats.byStatus[itemStatus].count++;
        stats.byStatus[itemStatus].revenue += parseFloat(item.total_price || 0);
      });

      // Round revenue values
      for (const key of Object.keys(stats.byStatus)) {
        stats.byStatus[key].revenue = parseFloat(
          stats.byStatus[key].revenue.toFixed(2),
        );
      }

      // byPaymentStatus from orders table (payment is order-level)
      orders?.forEach((order) => {
        const pStatus = order.payment_status || "pending";
        if (!stats.byPaymentStatus[pStatus]) {
          stats.byPaymentStatus[pStatus] = { count: 0 };
        }
        stats.byPaymentStatus[pStatus].count++;
      });

      return stats;
    } catch (error) {
      logger.error("Error getting warehouse order statistics:", error);
      throw error;
    }
  }

  /**
   * Get items for multiple orders filtered by a single warehouse
   */
  async _getWarehouseItemsForOrders(orderIds, warehouseId) {
    if (!orderIds || orderIds.length === 0) return {};

    try {
      // Fetch items that either match the warehouse_id OR have NULL warehouse_id
      // (NULL items belong to orders found via orders.warehouse_id fallback)
      const { data: items, error } = await this.supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds)
        .or(`warehouse_id.eq.${warehouseId},warehouse_id.is.null`)
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("Error getting warehouse order items:", error);
        return {};
      }

      const allFormatted = (items || []).map(this._formatOrderItem.bind(this));
      const enrichedWithVariants =
        await this._enrichItemsWithVariantData(allFormatted);
      const enriched =
        await this._enrichItemsWithSchoolData(enrichedWithVariants);

      const itemsMap = {};
      enriched.forEach((item) => {
        const oid = item.orderId || item._orderId;
        if (!itemsMap[oid]) itemsMap[oid] = [];
        itemsMap[oid].push(item);
      });

      return itemsMap;
    } catch (error) {
      logger.error("Error getting warehouse order items:", error);
      return {};
    }
  }

  /**
   * Get items for multiple orders filtered by multiple warehouses
   */
  async _getWarehouseItemsForOrdersBulk(orderIds, warehouseIds) {
    if (!orderIds || orderIds.length === 0) return {};

    try {
      // Fetch items matching any of the warehouse IDs OR with NULL warehouse_id
      // (NULL items belong to orders found via orders.warehouse_id fallback)
      const warehouseFilter = warehouseIds
        .map((id) => `warehouse_id.eq.${id}`)
        .join(",");
      const { data: items, error } = await this.supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds)
        .or(`${warehouseFilter},warehouse_id.is.null`)
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("Error getting bulk warehouse order items:", error);
        return {};
      }

      const allFormatted = (items || []).map(this._formatOrderItem.bind(this));
      const enrichedWithVariants =
        await this._enrichItemsWithVariantData(allFormatted);
      const enriched =
        await this._enrichItemsWithSchoolData(enrichedWithVariants);

      const itemsMap = {};
      enriched.forEach((item) => {
        const oid = item.orderId || item._orderId;
        if (!itemsMap[oid]) itemsMap[oid] = [];
        itemsMap[oid].push(item);
      });

      return itemsMap;
    } catch (error) {
      logger.error("Error getting bulk warehouse order items:", error);
      return {};
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
      warehouseId: row.warehouse_id,
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
    const isLockExpired = row.locked_at ? (new Date() - new Date(row.locked_at)) > this.LOCK_TIMEOUT_MS : true;

    return {
      id: row.id,
      _orderId: row.order_id, // Internal: used for batch grouping
      parentItemId: row.parent_item_id || null, // Allows nesting add-ons on the frontend
      productId: row.product_id,
      dispatchId: row.dispatch_id,
      variantId: row.variant_id,
      sku: row.sku,
      title: row.title,
      quantity: parseInt(row.quantity || 0),
      unitPrice: parseFloat(row.unit_price || 0),
      totalPrice: parseFloat(row.total_price || 0),
      deliveryFee: parseFloat(row.delivery_fee || 0),
      platformFee: parseFloat(row.platform_fee || 0),
      productSnapshot: row.product_snapshot || {},
      warehouseId: row.warehouse_id,
      status: row.status || "initialized", // Default for backward compatibility
      dispatchId: row.dispatch_id || null,
      lockedBy: isLockExpired ? null : (row.locked_by || null),
      lockedAt: isLockExpired ? null : (row.locked_at || null),
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
