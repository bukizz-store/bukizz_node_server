import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { PaymentController } from "../controllers/paymentController.js";
import { OrderService } from "../services/orderService.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { OrderEventRepository } from "../repositories/orderEventRepository.js";
import { WarehouseRepository } from "../repositories/warehouseRepository.js";
import { productPaymentMethodRepository } from "../repositories/productPaymentMethodRepository.js";
import { variantCommissionRepository } from "../repositories/variantCommissionRepository.js";
import { getSupabase } from "../db/index.js";

/**
 * Payment Routes Factory
 * @param {Object} dependencies - Dependency injection container
 * @returns {Router} Express router with payment routes
 */
export default function paymentRoutes(dependencies = {}) {
    const router = express.Router();

    // Get or create orderService for PaymentController
    let orderService = dependencies.orderService;
    if (!orderService) {
        // Lazy-init if not passed via DI
        const supabase = getSupabase();
        orderService = new OrderService(
            new OrderRepository(supabase),
            new ProductRepository(),
            new UserRepository(supabase),
            new OrderEventRepository(),
            null,
            new WarehouseRepository(),
            productPaymentMethodRepository,
            variantCommissionRepository,
        );
    }

    const paymentController = new PaymentController(orderService);

    // Webhook (No auth middleware as it comes from Razorpay)
    router.post("/webhook", paymentController.handleWebhook);

    // Apply authentication to all routes BELOW this line
    router.use(authenticateToken);

    // Create Razorpay Order
    router.post("/create-order", paymentController.createPaymentOrder);

    // Verify Payment
    router.post("/verify", paymentController.verifyPayment);

    // Reconcile Payment (if verify fails but money deducted)
    router.post("/reconcile", paymentController.reconcilePayment);

    // Log Payment Failure
    router.post("/failure", paymentController.handlePaymentFailure);

    return router;
}
