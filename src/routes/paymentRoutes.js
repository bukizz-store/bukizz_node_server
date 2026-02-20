import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { PaymentController } from "../controllers/paymentController.js";

/**
 * Payment Routes Factory
 * @returns {Router} Express router with payment routes
 */
export default function paymentRoutes() {
    const router = express.Router();
    const paymentController = new PaymentController();

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
