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

        // Apply bifurcation and data reduction
        const bifurcatedResult = this._formatBifurcatedRetailerOrders(result);

        logger.info("Retailer fetched warehouse orders (bifurcated)", {
            retailerId,
            warehouseId,
            originalOrdersCount: result.orders?.length || 0,
            bifurcatedOrdersCount: bifurcatedResult.orders?.length || 0,
        });

        res.json({
            success: true,
            data: bifurcatedResult,
            message: "Warehouse orders retrieved successfully",
        });
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

        // Apply bifurcation and data reduction
        const bifurcatedResult = this._formatBifurcatedRetailerOrders(result);

        res.json({
            success: true,
            data: bifurcatedResult,
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
        const bifurcatedResult = this._formatBifurcatedRetailerOrders(result);

        res.json({
            success: true,
            data: bifurcatedResult,
            message: `Warehouse orders with status '${status}' retrieved successfully`,
        });
    });

    /**
     * Internal helper to bifurcate and reduce order data for retailer portal
     */
    _formatBifurcatedRetailerOrders(result) {
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
                    shippingAddress: {
                        studentName: order.shippingAddress?.studentName || null,
                    },
                    createdAt: order.createdAt,
                    items: [
                        {
                            id: item.id,
                            schoolName: item.schoolName,
                            productId: item.productId,
                            variantId: item.variantId,
                            sku: item.sku,
                            title: item.title,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalPrice: item.totalPrice,
                            productSnapshot: {
                                image_url: item.productSnapshot?.image_url || item.productSnapshot?.image || null,
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

        return {
            ...result,
            orders: bifurcatedOrders,
            pagination: {
                ...result.pagination,
                total: bifurcatedOrders.length, // Update total to reflect bifurcated count in current page
                // Note: accurate totalPages calculation would require bifurcation at the repo/query level
                // For now, we update the count of the current results
            }
        };
    }
}

export const retailerOrderController = new RetailerOrderController();
