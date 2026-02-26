import { logger } from "../utils/logger.js";

/**
 * SMS Service - MSG91 Integration
 * Handles all SMS notifications for order events
 */
class SmsService {
    constructor() {
        this.authKey = process.env.MSG91_AUTH_KEY;
        this.senderId = process.env.MSG91_SENDER_ID || "BUKIZZ";
        this.baseUrl = "https://control.msg91.com/api/v5";
        this.orderConfirmTemplateId = process.env.MSG91_ORDER_CONFIRM_TEMPLATE_ID;
        this.deliveryTemplateId = process.env.MSG91_DELIVERY_TEMPLATE_ID;
        this.retailerTemplateId = process.env.MSG91_RETAILER_TEMPLATE_ID;

        if (!this.authKey) {
            logger.warn("📱 [SMS SERVICE] MSG91 AUTH_KEY not configured. SMS will be mocked.");
        }
    }

    /**
     * Send SMS via MSG91 Flow API
     */
    async _sendSms(phone, templateId, variables = {}) {
        const cleanPhone = this._cleanPhone(phone);
        if (!cleanPhone) {
            logger.warn("📱 [SMS SERVICE] Invalid phone number, skipping SMS", { phone });
            return null;
        }

        // Mock mode if auth key is not set
        if (!this.authKey) {
            logger.info("📱 [MOCK SMS] Would send SMS:", {
                phone: cleanPhone,
                templateId,
                variables,
            });
            console.log("\n================ SMS PREVIEW ================");
            console.log(`To: ${cleanPhone}`);
            console.log(`Template: ${templateId}`);
            console.log(`Variables: ${JSON.stringify(variables, null, 2)}`);
            console.log("==============================================\n");
            return { type: "mock", messageId: `mock-sms-${Date.now()}` };
        }

        try {
            const payload = {
                template_id: templateId,
                short_url: "0",
                recipients: [
                    {
                        mobiles: `91${cleanPhone}`,
                        ...variables,
                    },
                ],
            };

            const response = await fetch(`${this.baseUrl}/flow/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    authkey: this.authKey,
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok || result.type === "error") {
                logger.error("📱 [SMS SERVICE] MSG91 API error", {
                    status: response.status,
                    result,
                    phone: cleanPhone,
                });
                throw new Error(`MSG91 Error: ${result.message || response.statusText}`);
            }

            logger.info("📱 [SMS SERVICE] SMS sent successfully", {
                phone: cleanPhone,
                templateId,
                requestId: result.request_id,
            });

            return result;
        } catch (error) {
            logger.error("📱 [SMS SERVICE] Failed to send SMS", {
                phone: cleanPhone,
                error: error.message,
            });
            // Don't throw - SMS failure should not block order flow
            return null;
        }
    }

    /**
     * Clean and validate phone number (extract 10-digit Indian number)
     */
    _cleanPhone(phone) {
        if (!phone) return null;
        const digits = phone.replace(/\D/g, "");
        // Handle +91XXXXXXXXXX or 91XXXXXXXXXX or XXXXXXXXXX
        if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
        if (digits.length === 10) return digits;
        return null;
    }

    // ==========================================
    // PUBLIC METHODS
    // ==========================================

    /**
     * SMS #1: Order Confirmation → Customer
     * Triggered after successful order creation
     */
    async sendOrderConfirmationToCustomer(phone, orderData) {
        const { orderNumber, studentName, totalAmount, itemCount } = orderData;

        const variables = {
            order_number: orderNumber || "N/A",
            student_name: studentName || "Customer",
            amount: `₹${parseFloat(totalAmount || 0).toFixed(0)}`,
            item_count: String(itemCount || 1),
        };

        logger.info("📱 Sending order confirmation SMS to customer", { phone, orderNumber });
        return this._sendSms(phone, this.orderConfirmTemplateId, variables);
    }

    /**
     * SMS #2: Order Confirmation → Retailer (per-retailer items)
     * Triggered for each retailer involved in the order
     */
    async sendOrderConfirmationToRetailer(phone, retailerData) {
        const { orderNumber, studentName, itemSummary, totalAmount } = retailerData;

        const variables = {
            order_number: orderNumber || "N/A",
            student_name: studentName || "Customer",
            items: itemSummary || "Order items",
            amount: `₹${parseFloat(totalAmount || 0).toFixed(0)}`,
        };

        logger.info("📱 Sending order confirmation SMS to retailer", { phone, orderNumber });
        return this._sendSms(phone, this.retailerTemplateId, variables);
    }

    /**
     * SMS #3: Order Delivered → Customer
     * Triggered when order status changes to 'delivered'
     */
    async sendDeliveryConfirmationToCustomer(phone, orderData) {
        const { orderNumber, studentName } = orderData;

        const variables = {
            order_number: orderNumber || "N/A",
            student_name: studentName || "Customer",
        };

        logger.info("📱 Sending delivery confirmation SMS to customer", { phone, orderNumber });
        return this._sendSms(phone, this.deliveryTemplateId, variables);
    }
}

export const smsService = new SmsService();
export default smsService;
