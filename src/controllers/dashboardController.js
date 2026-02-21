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
      salesAndOrdersResult,
      lowStockResult,
      schoolsResult,
      recentOrdersResult,
    ] = await Promise.all([
      // 1. Total Sales + Active Orders
      this._getSalesAndActiveOrders(supabase, warehouseIds),
      // 2. Low Stock Variants (stock < 10)
      this._getLowStockVariantCount(supabase, warehouseIds),
      // 3. Active & Pending Schools
      this._getSchoolCounts(supabase, retailerId),
      // 4. Recent 5 Orders
      this._getRecentOrders(supabase, warehouseIds),
    ]);

    const data = {
      totalSales: salesAndOrdersResult.totalSales,
      activeOrders: salesAndOrdersResult.activeOrders,
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
   * Get total sales (sum of order_items.total_price) and number of active orders
   * Active orders = orders whose items are NOT in a terminal state (delivered, cancelled)
   */
  async _getSalesAndActiveOrders(supabase, warehouseIds) {
    if (warehouseIds.length === 0) {
      return { totalSales: 0, activeOrders: 0 };
    }

    // Get all order items for these warehouses
    const { data: items, error } = await supabase
      .from("order_items")
      .select("order_id, total_price, status, warehouse_id")
      .in("warehouse_id", warehouseIds);

    if (error) {
      logger.error("Error fetching order items for dashboard:", error);
      return { totalSales: 0, activeOrders: 0 };
    }

    const allItems = items || [];

    // Total sales = sum of all item total_price
    const totalSales = allItems.reduce(
      (sum, item) => sum + parseFloat(item.total_price || 0),
      0,
    );

    // Active orders = distinct order IDs where at least one item is NOT delivered/cancelled
    const activeStatuses = new Set([
      "initialized",
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
    ]);
    const activeOrderIds = new Set();
    allItems.forEach((item) => {
      if (activeStatuses.has(item.status)) {
        activeOrderIds.add(item.order_id);
      }
    });

    return {
      totalSales: parseFloat(totalSales.toFixed(2)),
      activeOrders: activeOrderIds.size,
    };
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
      });

      // Return simplified order objects for the overview
      return (result.orders || []).map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalPrice: order.totalPrice,
        paymentStatus: order.paymentStatus,
        customerName:
          order.shippingAddress?.name || order.contactEmail || "Unknown",
        createdAt: order.createdAt,
        itemCount: order.items?.length || 0,
      }));
    } catch (error) {
      logger.error("Error fetching recent orders for dashboard:", error);
      return [];
    }
  }
}

export const dashboardController = new DashboardController();
