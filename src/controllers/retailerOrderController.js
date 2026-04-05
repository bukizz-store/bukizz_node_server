import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { OrderService } from "../services/orderService.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { OrderEventRepository } from "../repositories/orderEventRepository.js";
import { OrderQueryRepository } from "../repositories/orderQueryRepository.js";
import { WarehouseRepository } from "../repositories/warehouseRepository.js";
import { getSupabase } from "../db/index.js";

// Lazy-initialized order service singleton
let orderService = null;

function getOrderService() {
    if (!orderService) {
        const supabase = getSupabase();
        const orderRepository = new OrderRepository(supabase);
        const productRepository = new ProductRepository();
        const userRepository = new UserRepository(supabase);
        const orderEventRepository = new OrderEventRepository();
        const orderQueryRepository = new OrderQueryRepository();
        const warehouseRepository = new WarehouseRepository();

        orderService = new OrderService(
            orderRepository,
            productRepository,
            userRepository,
            orderEventRepository,
            orderQueryRepository,
            warehouseRepository
        );
    }
    return orderService;
}

/**
 * Retailer Order Controller
 * Handles all retailer portal order-related HTTP requests (warehouse-wise)
 */
export class RetailerOrderController {
    /**
     * Get all orders for a specific warehouse
     * GET /api/v1/retailer/orders/warehouse/:warehouseId
     */
    getOrdersByWarehouse = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { warehouseId } = req.params;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        if (!warehouseId) {
            return res.status(400).json({
                success: false,
                message: "Warehouse ID is required",
            });
        }

        const filters = {
            status: req.query.status,
            page: parseInt(req.query.page) || 1,
            limit: Math.min(parseInt(req.query.limit) || 20, 100),
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            sortBy: req.query.sortBy || "created_at",
            sortOrder: req.query.sortOrder || "desc",
            searchTerm: req.query.search,
            paymentStatus: req.query.paymentStatus,
        };

        const service = getOrderService();
        const result = await service.getOrdersByWarehouseId(warehouseId, retailerId, filters);

        // Data is already item-level paginated and bifurcated from the repository
        logger.info("Retailer fetched warehouse orders", {
            retailerId,
            warehouseId,
            ordersCount: result.orders?.length || 0,
        });

        res.json({
            success: true,
            data: result,
            message: "Warehouse orders retrieved successfully",
        });
    });

    /**
     * POST /api/v1/retailer/orders/warehouse/:warehouseId/filter
     * Advanced filtered order query
     */
    getFilteredOrders = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { warehouseId } = req.params;

        if (!retailerId) return res.status(401).json({ success: false, message: "User not authenticated" });
        if (!warehouseId) return res.status(400).json({ success: false, message: "Warehouse ID is required" });

        const filters = {
            status: req.body.status,
            page: parseInt(req.body.page) || 1,
            limit: req.body.limit === 'all' ? 99999 : Math.min(parseInt(req.body.limit) || 50, 99999),
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            sortBy: req.body.sortBy || "created_at",
            sortOrder: req.body.sortOrder || "desc",
            searchTerm: req.body.search,
            productType: req.body.productType,
            schoolIds: req.body.schoolIds || [],
            productIds: req.body.productIds || [],
            statusList: req.body.statusList || [],
        };

        const service = getOrderService();
        const result = await service.getFilteredOrdersByWarehouse(warehouseId, retailerId, filters);

        res.json({ success: true, data: result, message: "Filtered orders retrieved successfully" });
    });

    /**
     * GET /api/v1/retailer/orders/warehouse/:warehouseId/filter-options/schools
     */
    getFilterSchools = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { warehouseId } = req.params;

        if (!retailerId) return res.status(401).json({ success: false, message: "User not authenticated" });
        if (!warehouseId) return res.status(400).json({ success: false, message: "Warehouse ID is required" });

        const service = getOrderService();
        const schools = await service.getFilterSchools(warehouseId, retailerId);

        res.json({ success: true, data: schools });
    });

    /**
     * GET /api/v1/retailer/orders/warehouse/:warehouseId/filter-options/products
     */
    getFilterProducts = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { warehouseId } = req.params;
        const schoolIds = req.query.schoolIds ? req.query.schoolIds.split(",").filter(Boolean) : [];

        if (!retailerId) return res.status(401).json({ success: false, message: "User not authenticated" });
        if (!warehouseId) return res.status(400).json({ success: false, message: "Warehouse ID is required" });

        const service = getOrderService();
        const products = await service.getFilterProducts(warehouseId, retailerId, schoolIds);

        res.json({ success: true, data: products });
    });

    /**
     * GET /api/v1/retailer/orders/warehouse/:warehouseId/filter-options/statuses
     */
    getFilterStatuses = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { warehouseId } = req.params;

        if (!retailerId) return res.status(401).json({ success: false, message: "User not authenticated" });
        if (!warehouseId) return res.status(400).json({ success: false, message: "Warehouse ID is required" });

        const service = getOrderService();
        const statuses = await service.getFilterStatuses(warehouseId, retailerId);

        res.json({ success: true, data: statuses });
    });

    /**
     * Get all orders across all retailer warehouses
     * GET /api/v1/retailer/orders
     */
    getAllRetailerOrders = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        const filters = {
            status: req.query.status,
            page: parseInt(req.query.page) || 1,
            limit: Math.min(parseInt(req.query.limit) || 20, 100),
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            sortBy: req.query.sortBy || "created_at",
            sortOrder: req.query.sortOrder || "desc",
            searchTerm: req.query.search,
            paymentStatus: req.query.paymentStatus,
        };

        const service = getOrderService();
        const result = await service.getRetailerOrders(retailerId, filters);

        // Data is already item-level paginated and bifurcated from the repository
        res.json({
            success: true,
            data: result,
            message: "Retailer orders retrieved successfully",
        });
    });

    /**
     * Get a specific order detail (retailer view - only shows items for their warehouses)
     * GET /api/v1/retailer/orders/:orderId
     */
    getOrderDetail = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { orderId } = req.params;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: "Order ID is required",
            });
        }

        const service = getOrderService();
        const order = await service.getRetailerOrderById(orderId, retailerId);

        res.json({
            success: true,
            data: { order },
            message: "Order details retrieved successfully",
        });
    });

    /**
     * Get order statistics for a specific warehouse
     * GET /api/v1/retailer/orders/warehouse/:warehouseId/stats
     */
    getWarehouseOrderStats = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { warehouseId } = req.params;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        if (!warehouseId) {
            return res.status(400).json({
                success: false,
                message: "Warehouse ID is required",
            });
        }

        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate,
        };

        const service = getOrderService();
        const stats = await service.getWarehouseOrderStats(warehouseId, retailerId, filters);

        res.json({
            success: true,
            data: stats,
            message: "Warehouse order statistics retrieved successfully",
        });
    });

    /**
     * Get aggregated order statistics across all retailer warehouses
     * GET /api/v1/retailer/orders/stats
     */
    getRetailerOrderStats = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate,
        };

        const service = getOrderService();
        const stats = await service.getRetailerOrderStats(retailerId, filters);

        res.json({
            success: true,
            data: stats,
            message: "Retailer order statistics retrieved successfully",
        });
    });

    /**
     * Update order status (retailer can update orders in their warehouses)
     * PUT /api/v1/retailer/orders/:orderId/status
     */
    updateOrderStatus = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { orderId } = req.params;
        const { status, note, metadata = {} } = req.body;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        if (!orderId || !status) {
            return res.status(400).json({
                success: false,
                message: "Order ID and status are required",
            });
        }

        // First verify retailer has access to this order
        const service = getOrderService();
        await service.getRetailerOrderById(orderId, retailerId); // Will throw if no access

        const updatedOrder = await service.updateOrderStatus(
            orderId,
            status,
            retailerId,
            note,
            metadata
        );

        logger.info("Retailer updated order status", {
            retailerId,
            orderId,
            newStatus: status,
        });

        res.json({
            success: true,
            data: { order: updatedOrder },
            message: "Order status updated successfully",
        });
    });

    /**
     * Update order item status (retailer can update items in their warehouses)
     * PUT /api/v1/retailer/orders/:orderId/items/:itemId/status
     */
    updateOrderItemStatus = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { orderId, itemId } = req.params;
        const { status, note, metadata = {} } = req.body;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        if (!orderId || !itemId || !status) {
            return res.status(400).json({
                success: false,
                message: "Order ID, Item ID, and status are required",
            });
        }

        // Verify retailer has access to this order
        const service = getOrderService();
        const order = await service.getRetailerOrderById(orderId, retailerId);

        // Verify the item belongs to retailer's warehouses
        const item = order.items?.find((i) => i.id === itemId);
        if (!item) {
            return res.status(403).json({
                success: false,
                message: "Access denied. This item does not belong to your warehouses.",
            });
        }

        const updatedItem = await service.updateOrderItemStatus(
            orderId,
            itemId,
            status,
            retailerId,
            note,
            metadata
        );

        logger.info("Retailer updated order item status", {
            retailerId,
            orderId,
            itemId,
            newStatus: status,
        });

        res.json({
            success: true,
            data: { item: updatedItem },
            message: "Order item status updated successfully",
        });
    });

    /**
     * Get orders by status for a specific warehouse
     * GET /api/v1/retailer/orders/warehouse/:warehouseId/status/:status
     */
    getWarehouseOrdersByStatus = asyncHandler(async (req, res) => {
        const retailerId = req.user?.id;
        const { warehouseId, status } = req.params;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated",
            });
        }

        const filters = {
            status,
            page: parseInt(req.query.page) || 1,
            limit: Math.min(parseInt(req.query.limit) || 20, 100),
            sortBy: req.query.sortBy || "created_at",
            sortOrder: req.query.sortOrder || "desc",
        };

        const service = getOrderService();
        const result = await service.getOrdersByWarehouseId(warehouseId, retailerId, filters);

        // Apply bifurcation and data reduction
        const bifurcatedResult = this._formatBifurcatedRetailerOrders(result, status);

        res.json({
            success: true,
            data: bifurcatedResult,
            message: `Warehouse orders with status '${status}' retrieved successfully`,
        });
    });

    /**
     * Internal helper to bifurcate and reduce order data for retailer portal
     */
    _formatBifurcatedRetailerOrders(result, requestedStatus) {
        if (!result || !result.orders || !Array.isArray(result.orders)) {
            return result;
        }

        const bifurcatedOrders = [];

        result.orders.forEach((order) => {
            if (!order.items || !Array.isArray(order.items)) {
                return;
            }

            order.items.forEach((item) => {
                // Create a lean bifurcated order record
                const bifurcatedOrder = {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    userId: order.userId,
                    status: order.status,
                    totalAmount: order.totalAmount,
                    currency: order.currency || "INR",
                    paymentMethod: order.paymentMethod,
                    paymentStatus: order.paymentStatus,
                    shippingAddress: {
                        studentName: order.shippingAddress?.studentName || null,
                        recipientName: order.shippingAddress?.recipientName || null,
                        line1: order.shippingAddress?.line1,
                        line2: order.shippingAddress?.line2,
                        city: order.shippingAddress?.city,
                        state: order.shippingAddress?.state,
                        postalCode:order.shippingAddress?.postalCode,
                        phone: order.shippingAddress?.phone
                    },
                    contactPhone: order.contactPhone,
                    createdAt: order.createdAt,
                    items: [
                        {
                            id: item.id,
                            schoolName: item.schoolName,
                            dispatchId: item.dispatchId,
                            productId: item.productId,
                            variantId: item.variantId,
                            sku: item.sku,
                            title: item.title,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalPrice: item.totalPrice,
                            deliveryFee: item.deliveryFee || 0,
                            platformFee: item.platformFee || 0,
                            delivery_fee: item.deliveryFee || 0,
                            platform_fee: item.platformFee || 0,
                            productSnapshot: {
                                image_url: item.productSnapshot?.image_url || item.productSnapshot?.image || null,
                                metadata: item.productSnapshot?.metadata || {},
                            },
                            status: item.status,
                            variant: item.variant ? {
                                id: item.variant.id,
                                sku: item.variant.sku,
                                options: (item.variant.options || []).map(opt => ({
                                    id: opt.id,
                                    value: opt.value
                                }))
                            } : null
                        }
                    ]
                };

                bifurcatedOrders.push(bifurcatedOrder);
            });
        });

        // The total number of bifurcated items across all pages for the current filter
        // If the repository provides statusCounts, use the count for the current status (or 'all').
        // Otherwise, fallback to the repository's total (which is the parent order count).
        const currentStatus = requestedStatus || 'all';
        const accurateTotal = result.statusCounts 
            ? (result.statusCounts[currentStatus] || 0)
            : result.pagination?.total || bifurcatedOrders.length;

        return {
            ...result,
            orders: bifurcatedOrders,
            statusCounts: result.statusCounts || null,
            pagination: {
                ...result.pagination,
                total: accurateTotal, // Update total to reflect bifurcated count for accurate frontend pagination
                totalPages: Math.ceil(accurateTotal / (result.pagination?.limit || 20))
            }
        };
    }
}

export const retailerOrderController = new RetailerOrderController();
