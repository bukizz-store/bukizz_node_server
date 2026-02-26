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
      "initialized",
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
}

export const dashboardController = new DashboardController();
