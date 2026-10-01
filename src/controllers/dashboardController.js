import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { getSupabase } from "../db/index.js";
import { WarehouseRepository } from "../repositories/warehouseRepository.js";
import { OrderRepository } from "../repositories/orderRepository.js";

const warehouseRepo = new WarehouseRepository();

/**
 * Dashboard Controller
 * Provides aggregated overview data for the retailer dashboard in a single call
 */
export class DashboardController {
  /**
   * GET /api/v1/retailer/dashboard/overview
   * Returns: totalSales, activeOrders, lowStockVariants, activeSchools, pendingSchools, recentOrders
   */
  getDashboardOverview = asyncHandler(async (req, res) => {
    const retailerId = req.user?.id;

    if (!retailerId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const supabase = getSupabase();

    // Step 1: Get retailer's warehouse IDs
    const warehouses = await warehouseRepo.findByRetailerId(retailerId);
    const warehouseIds = (warehouses || []).map((w) => w.id);

    // Run all queries in parallel
    const [
      totalSalesResult,
      activeOrdersResult,
      lowStockResult,
      schoolsResult,
      recentOrdersResult,
    ] = await Promise.all([
      // 1a. Total Sales (from settlements)
      this._getTotalSales(supabase, retailerId),
      // 1b. Active Orders (from order_items)
      this._getActiveOrders(supabase, warehouseIds),
      // 2. Low Stock Variants (stock < 10)
      this._getLowStockVariantCount(supabase, warehouseIds),
      // 3. Active & Pending Schools
      this._getSchoolCounts(supabase, retailerId),
      // 4. Recent 5 Orders
      this._getRecentOrders(supabase, warehouseIds),
    ]);

    const data = {
      totalSales: totalSalesResult,
      activeOrders: activeOrdersResult,
      lowStockVariants: lowStockResult,
      activeSchools: schoolsResult.activeSchools,
      pendingSchools: schoolsResult.pendingSchools,
      recentOrders: recentOrdersResult,
    };

    logger.info("Dashboard overview fetched", {
      retailerId,
      warehouseCount: warehouseIds.length,
    });

    res.json({
      success: true,
      data,
      message: "Dashboard overview retrieved successfully",
    });
  });

  /**
   * Get total sales by summing up the amount for all 'ORDER_REVENUE' transactions
   * in the seller_ledgers table. This is a global metric for the retailer, so it ignores warehouseIds.
   * Matches logic: COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'ORDER_REVENUE'), 0) AS total_sales
   */
  async _getTotalSales(supabase, retailerId) {
    const { data, error } = await supabase
      .from("seller_ledgers")
      .select("amount")
      .eq("retailer_id", retailerId)
      .eq("transaction_type", "ORDER_REVENUE");

    if (error) {
      logger.error("Error fetching ledgers for dashboard total sales:", error);
      return 0;
    }

    const totalSales = (data || []).reduce((sum, record) => {
      return sum + parseFloat(record.amount || 0);
    }, 0);

    return parseFloat(totalSales.toFixed(2));
  }

  /**
   * Get the number of active orders
   * Active orders = orders whose items are NOT in a terminal state (delivered, cancelled)
   */
  async _getActiveOrders(supabase, warehouseIds) {
    if (warehouseIds.length === 0) {
      return 0;
    }

    // Get all order items for these warehouses
    const { data: items, error } = await supabase
      .from("order_items")
      .select("order_id, status")
      .in("warehouse_id", warehouseIds);

    if (error) {
      logger.error(
        "Error fetching order items for dashboard active orders:",
        error,
      );
      return 0;
    }

    const allItems = items || [];

    const activeStatusesForActiveOrders = new Set([
      "processed",
      "shipped",
      "out_for_delivery",
    ]);

    const activeOrderIds = new Set();
    allItems.forEach((item) => {
      if (activeStatusesForActiveOrders.has(item.status)) {
        activeOrderIds.add(item.order_id);
      }
    });

    return activeOrderIds.size;
  }

  /**
   * Count product variants with stock < 10 belonging to the retailer's warehouses
   */
  async _getLowStockVariantCount(supabase, warehouseIds) {
    if (warehouseIds.length === 0) return 0;

    // Get product IDs from the retailer's warehouses
    const { data: productWarehouseLinks, error: pwError } = await supabase
      .from("products_warehouse")
      .select("product_id")
      .in("warehouse_id", warehouseIds);

    if (
      pwError ||
      !productWarehouseLinks ||
      productWarehouseLinks.length === 0
    ) {
      return 0;
    }

    const productIds = [
      ...new Set(productWarehouseLinks.map((pw) => pw.product_id)),
    ];

    // Count variants with stock < 10
    const { count, error } = await supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .in("product_id", productIds)
      .lt("stock", 10);

    if (error) {
      logger.error("Error counting low stock variants:", error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Count active (approved) and pending schools for the retailer
   */
  async _getSchoolCounts(supabase, retailerId) {
    const { data, error } = await supabase
      .from("retailer_schools")
      .select("status")
      .eq("retailer_id", retailerId);

    if (error) {
      logger.error("Error fetching school counts:", error);
      return { activeSchools: 0, pendingSchools: 0 };
    }

    const rows = data || [];
    const activeSchools = rows.filter((r) => r.status === "approved").length;
    const pendingSchools = rows.filter((r) => r.status === "pending").length;

    return { activeSchools, pendingSchools };
  }

  /**
   * Get the 5 most recent orders across the retailer's warehouses
   */
  async _getRecentOrders(supabase, warehouseIds) {
    if (warehouseIds.length === 0) return [];

    try {
      const orderRepo = new OrderRepository(supabase);
      const result = await orderRepo.getByWarehouseIds(warehouseIds, {
        limit: 5,
        page: 1,
        sortBy: "created_at",
        sortOrder: "desc",
        validOrderStatuses: ["processed"],
      });

      const orders = result.orders || [];
      if (orders.length === 0) return [];

      // Return simplified order objects for the overview
      return orders.map((order) => {
        // Format Items including the requested details
        const formattedItems = (order.items || []).map((item) => {
          let variantDetail = null;

          if (
            item.variant &&
            item.variant.options &&
            item.variant.options.length > 0
          ) {
            variantDetail = item.variant.options
              .map((opt) =>
                opt.attribute?.name
                  ? `${opt.attribute.name}: ${opt.value}`
                  : opt.value,
              )
              .join(" • ");
          } else if (item.productSnapshot) {
            const parts = [];
            if (item.productSnapshot.size)
              parts.push(`Size: ${item.productSnapshot.size}`);
            if (item.productSnapshot.color)
              parts.push(`Color: ${item.productSnapshot.color}`);
            if (parts.length > 0) variantDetail = parts.join(" • ");
          }

          return {
            id: item.id,
            title: item.title,
            price: item.unitPrice,
            schoolName: item.schoolName, // Now provided by repository enrichment
            variantDetail,
            status: item.status || order.status || "initialized",
          };
        });

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalPrice: order.totalAmount || order.totalPrice, // Use totalAmount from Parent Order
          paymentStatus: order.paymentStatus,
          customerName:
            order.shippingAddress?.name || order.contactEmail || "Unknown",
          createdAt: order.createdAt,
          itemCount: order.items?.length || 0,
          items: formattedItems,
        };
      });
    } catch (error) {
      logger.error("Error fetching recent orders for dashboard:", error);
      return [];
    }
  }

  /**
   * GET /api/v1/admin/dashboard/overview
   * Returns aggregated platform-wide e-commerce overview for admins,
   * supporting optional multi-retailer filtering (?retailerIds=id1,id2)
   */
  getAdminDashboardOverview = asyncHandler(async (req, res) => {
    const supabase = getSupabase();

    // Parse requested retailer filter if present
    const rawRetailerIds = req.query.retailerIds;
    let selectedRetailerIds = [];
    if (rawRetailerIds) {
      selectedRetailerIds = (
        Array.isArray(rawRetailerIds)
          ? rawRetailerIds
          : String(rawRetailerIds).split(",")
      )
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const isFiltered = selectedRetailerIds.length > 0;

    // Run parallel baseline metadata queries across Supabase
    const [
      availableRetailersResult,
      schoolsResult,
      productsResult,
      customersResult,
      retailersResult,
      deliveryPartnersResult,
      pendingRetailersResult,
      pendingSchoolRetailersResult,
      openQueriesResult,
    ] = await Promise.all([
      supabase
        .from("users")
        .select(
          "id, full_name, email, is_active, deactivation_reason, retailer_data!retailer_id(display_name, owner_name)"
        )
        .eq("role", "retailer")
        .order("full_name", { ascending: true }),
      supabase.from("schools").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "customer"),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "retailer"),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "delivery_partner"),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "retailer").eq("is_active", false).eq("deactivation_reason", "unauthorized"),
      supabase.from("retailer_schools").select("school_id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("order_queries").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    const availableRetailers = (availableRetailersResult.data || []).map((r) => {
      const rd = r.retailer_data;
      const storeName = rd?.display_name || r.full_name;
      const isActive =
        r.is_active &&
        r.deactivation_reason !== "unauthorized" &&
        r.deactivation_reason !== "User requested account deletion";
      return {
        id: r.id,
        name: r.full_name,
        storeName,
        email: r.email,
        isActive,
      };
    });

    let ordersResult;
    let recentOrdersResult;
    let timelineResult;
    let activeSchoolsCount = schoolsResult.count || 0;
    let activeCustomersCount = customersResult.count || 0;
    let activeRetailersCount = retailersResult.count || 0;

    if (isFiltered) {
      // 1. Get warehouse IDs for selected retailers
      const { data: rw } = await supabase
        .from("retailer_warehouse")
        .select("warehouse_id")
        .in("retailer_id", selectedRetailerIds);
      const whIds = Array.from(new Set((rw || []).map((r) => r.warehouse_id)));

      if (whIds.length === 0) {
        ordersResult = {
          totalRevenue: 0,
          totalOrders: 0,
          averageOrderValue: 0,
          byStatus: {},
          byPaymentMethod: {},
        };
        recentOrdersResult = [];
        timelineResult = [];
        activeCustomersCount = 0;
        activeSchoolsCount = 0;
      } else {
        // Query order_items with warehouse_id filter
        const { data: items, error: itemsError } = await supabase
          .from("order_items")
          .select(
            "order_id, status, orders!order_id(id, total_amount, status, payment_method, payment_status, created_at, user_id, users!user_id(full_name, email, phone))"
          )
          .in("warehouse_id", whIds);

        const orderMap = new Map();
        (items || []).forEach((item) => {
          if (item.orders && !orderMap.has(item.order_id)) {
            orderMap.set(item.order_id, item.orders);
          }
        });
        const filteredOrders = Array.from(orderMap.values());

        ordersResult = this._computeOrdersStats(filteredOrders);
        recentOrdersResult = this._formatRecentOrders(filteredOrders.slice(0, 6));
        timelineResult = this._computeRevenueTimeline(filteredOrders);

        // Distinct customer count for these retailers
        const distinctCustomerIds = new Set(
          filteredOrders.map((o) => o.user_id).filter(Boolean)
        );
        activeCustomersCount = distinctCustomerIds.size;

        // Distinct schools linked to selected retailers
        const { data: rs } = await supabase
          .from("retailer_schools")
          .select("school_id")
          .in("retailer_id", selectedRetailerIds);
        activeSchoolsCount = new Set((rs || []).map((r) => r.school_id)).size;
      }

      activeRetailersCount = selectedRetailerIds.length;
    } else {
      [ordersResult, recentOrdersResult, timelineResult] = await Promise.all([
        this._getPlatformOrderStats(supabase),
        this._getPlatformRecentOrders(supabase),
        this._getPlatformRevenueTimeline(supabase),
      ]);
    }

    const data = {
      kpis: {
        totalRevenue: ordersResult.totalRevenue,
        totalOrders: ordersResult.totalOrders,
        averageOrderValue: ordersResult.averageOrderValue,
        activeCustomers: activeCustomersCount,
        activeSchools: activeSchoolsCount,
        activeRetailers: activeRetailersCount,
        totalProducts: productsResult.count || 0,
        activeDeliveryPartners: deliveryPartnersResult.count || 0,
      },
      orderMetrics: {
        byStatus: ordersResult.byStatus,
        byPaymentMethod: ordersResult.byPaymentMethod,
      },
      pendingActions: {
        pendingRetailers: pendingRetailersResult.count || 0,
        pendingSchoolRetailers: pendingSchoolRetailersResult.count || 0,
        openQueries: openQueriesResult.count || 0,
      },
      revenueTimeline: timelineResult,
      recentOrders: recentOrdersResult,
      availableRetailers,
      isFiltered,
    };

    res.json({
      success: true,
      data,
      message: "Admin dashboard overview retrieved successfully",
    });
  });

  _computeOrdersStats(orders) {
    let totalRevenue = 0;
    const totalOrders = orders.length;
    const byStatus = {};
    const byPaymentMethod = {};

    for (const order of orders) {
      const amt = parseFloat(order.total_amount || 0);
      const status = order.status || "initialized";
      const method = order.payment_method || "unknown";

      if (status !== "cancelled") {
        totalRevenue += amt;
      }

      if (!byStatus[status]) {
        byStatus[status] = { count: 0, revenue: 0 };
      }
      byStatus[status].count++;
      byStatus[status].revenue = parseFloat(
        (byStatus[status].revenue + amt).toFixed(2)
      );

      if (!byPaymentMethod[method]) {
        byPaymentMethod[method] = { count: 0, revenue: 0 };
      }
      byPaymentMethod[method].count++;
      byPaymentMethod[method].revenue = parseFloat(
        (byPaymentMethod[method].revenue + amt).toFixed(2)
      );
    }

    const validOrderCount = orders.filter((o) => o.status !== "cancelled").length;
    const averageOrderValue =
      validOrderCount > 0
        ? parseFloat((totalRevenue / validOrderCount).toFixed(2))
        : 0;

    return {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalOrders,
      averageOrderValue,
      byStatus,
      byPaymentMethod,
    };
  }

  _formatRecentOrders(orders) {
    const sorted = [...orders].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    return sorted.slice(0, 6).map((o) => ({
      id: o.id,
      totalAmount: parseFloat(o.total_amount || 0),
      status: o.status || "initialized",
      paymentMethod: o.payment_method || "unknown",
      paymentStatus: o.payment_status || "pending",
      createdAt: o.created_at,
      customerName:
        o.users?.full_name || o.users?.email?.split("@")[0] || "Guest Customer",
      customerEmail: o.users?.email || "—",
      customerPhone: o.users?.phone || "—",
    }));
  }

  _computeRevenueTimeline(orders) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recent = orders.filter(
      (o) => new Date(o.created_at) >= sixMonthsAgo
    ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const monthMap = {};
    for (const o of recent) {
      const d = new Date(o.created_at);
      const key = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      if (!monthMap[key]) {
        monthMap[key] = { period: key, revenue: 0, orders: 0 };
      }
      monthMap[key].orders++;
      if (o.status !== "cancelled") {
        monthMap[key].revenue += parseFloat(o.total_amount || 0);
      }
    }

    return Object.values(monthMap).map((m) => ({
      ...m,
      revenue: parseFloat(m.revenue.toFixed(2)),
    }));
  }

  async _getPlatformOrderStats(supabase) {
    try {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("total_amount, status, payment_method");

      if (error || !orders) {
        logger.error("Error fetching platform order stats:", error);
        return {
          totalRevenue: 0,
          totalOrders: 0,
          averageOrderValue: 0,
          byStatus: {},
          byPaymentMethod: {},
        };
      }

      return this._computeOrdersStats(orders);
    } catch (err) {
      logger.error("Error in _getPlatformOrderStats:", err);
      return {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        byStatus: {},
        byPaymentMethod: {},
      };
    }
  }

  async _getPlatformRecentOrders(supabase) {
    try {
      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          "id, total_amount, status, payment_method, payment_status, created_at, users!user_id(full_name, email, phone)"
        )
        .order("created_at", { ascending: false })
        .limit(6);

      if (error || !orders) {
        logger.error("Error fetching recent orders:", error);
        return [];
      }

      return this._formatRecentOrders(orders);
    } catch (err) {
      logger.error("Error in _getPlatformRecentOrders:", err);
      return [];
    }
  }

  async _getPlatformRevenueTimeline(supabase) {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: orders, error } = await supabase
        .from("orders")
        .select("total_amount, created_at, status")
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: true });

      if (error || !orders) {
        return [];
      }

      return this._computeRevenueTimeline(orders);
    } catch (err) {
      logger.error("Error in _getPlatformRevenueTimeline:", err);
      return [];
    }
  }
}

export const dashboardController = new DashboardController();
