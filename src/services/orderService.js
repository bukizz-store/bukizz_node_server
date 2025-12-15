import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Order Service
 * Handles order management business logic with enhanced schema support
 */
export class OrderService {
  constructor(
    orderRepository,
    productRepository,
    userRepository,
    orderEventRepository,
    orderQueryRepository
  ) {
    this.orderRepository = orderRepository;
    this.productRepository = productRepository;
    this.userRepository = userRepository;
    this.orderEventRepository = orderEventRepository;
    this.orderQueryRepository = orderQueryRepository;
  }

  /**
   * Create a new order with enhanced validation and atomic transactions
   */
  async createOrder(orderData) {
    const {
      userId,
      items,
      shippingAddress,
      billingAddress,
      contactPhone,
      contactEmail,
      paymentMethod = "cod",
      metadata = {},
    } = orderData;

    try {
      logger.info("Starting atomic order creation", {
        userId,
        itemCount: items?.length,
        paymentMethod,
      });

      // Phase 1: Pre-validation (non-blocking checks)
      await this._validateOrderPrerequisites(
        userId,
        items,
        shippingAddress,
        paymentMethod,
        contactPhone,
        contactEmail
      );

      // Phase 2: Atomic stock reservation and order creation
      const order = await this._executeAtomicOrderCreation({
        userId,
        items,
        shippingAddress,
        billingAddress,
        contactPhone,
        contactEmail,
        paymentMethod,
        metadata,
      });

      logger.info("Order created successfully with atomic guarantees", {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
      });

      return order;
    } catch (error) {
      logger.error("Atomic order creation failed", {
        userId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Comprehensive pre-validation before atomic operation
   */
  async _validateOrderPrerequisites(
    userId,
    items,
    shippingAddress,
    paymentMethod,
    contactPhone,
    contactEmail
  ) {
    const validationErrors = [];

    try {
      logger.info("Starting order prerequisite validation", {
        userId,
        itemCount: items?.length,
        hasShippingAddress: !!shippingAddress,
        paymentMethod,
        hasContactInfo: !!(contactPhone || contactEmail),
      });

      // 1. Validate user exists and is active
      logger.debug("Validating user existence", { userId });
      const user = await this.userRepository.findById(userId);
      logger.debug("User validation result", {
        userFound: !!user,
        isActive: user?.isActive,
      });

      if (!user) {
        validationErrors.push("User not found");
      } else if (!user.isActive) {
        validationErrors.push("User account is inactive");
      }

      // 2. Validate order items structure
      if (!items || !Array.isArray(items) || items.length === 0) {
        validationErrors.push("Order must contain at least one item");
      } else {
        // Validate each item structure
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.productId) {
            validationErrors.push(`Item ${i + 1}: Product ID is required`);
          }
          if (!item.quantity || item.quantity <= 0) {
            validationErrors.push(`Item ${i + 1}: Valid quantity is required`);
          }
          if (item.quantity > 1000) {
            validationErrors.push(
              `Item ${i + 1}: Quantity exceeds maximum limit (1000)`
            );
          }
        }
      }

      // 3. Validate shipping address - handle both direct props and nested structure
      if (!shippingAddress) {
        validationErrors.push("Shipping address is required");
      } else {
        const requiredFields = ["line1", "city", "state", "postalCode"];
        for (const field of requiredFields) {
          if (!shippingAddress[field]) {
            validationErrors.push(`Shipping address: ${field} is required`);
          }
        }

        // Validate postal code format (basic check)
        if (
          shippingAddress.postalCode &&
          !/^\d{6}$/.test(shippingAddress.postalCode)
        ) {
          validationErrors.push(
            "Invalid postal code format. Expected 6 digits."
          );
        }

        // Validate required contact information in address or separately
        if (!shippingAddress.recipientName) {
          validationErrors.push(
            "Recipient name is required in shipping address"
          );
        }

        if (!shippingAddress.phone && !contactPhone) {
          validationErrors.push("Contact phone number is required");
        }
      }

      // 4. Validate payment method
      const validPaymentMethods = [
        "cod",
        "upi",
        "card",
        "netbanking",
        "wallet",
      ];
      if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
        validationErrors.push(
          `Invalid payment method. Allowed: ${validPaymentMethods.join(", ")}`
        );
      }

      // 5. Validate contact information (more lenient since it's optional in many cases)
      if (contactPhone && !/^\+?[\d\s\-\(\)]{10,15}$/.test(contactPhone)) {
        validationErrors.push("Invalid phone number format");
      }

      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        validationErrors.push("Invalid email format");
      }

      if (validationErrors.length > 0) {
        throw new AppError(
          `Order validation failed: ${validationErrors.join("; ")}`,
          400
        );
      }

      logger.info("Order prerequisite validation completed successfully", {
        userId,
        validationsPassed: [
          "user_exists",
          "items_valid",
          "address_valid",
          "payment_method_valid",
          "contact_info_valid",
        ],
      });
    } catch (error) {
      logger.error("Order prerequisite validation failed with system error", {
        userId,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.constructor.name,
        userRepositoryExists: !!this.userRepository,
        userRepositoryMethods: this.userRepository
          ? Object.getOwnPropertyNames(
              Object.getPrototypeOf(this.userRepository)
            )
          : "N/A",
      });

      if (error instanceof AppError) throw error;
      throw new AppError(
        `Order validation failed due to system error: ${error.message}`,
        500
      );
    }
  }

  /**
   * Execute atomic order creation with stock reservation and rollback capability
   */
  async _executeAtomicOrderCreation(orderData) {
    const {
      userId,
      items,
      shippingAddress,
      billingAddress,
      contactPhone,
      contactEmail,
      paymentMethod,
      metadata,
    } = orderData;

    return await this.orderRepository.executeTransaction(async (connection) => {
      try {
        // Step 1: Validate and reserve stock for all items atomically
        const validatedItems = await this._validateAndReserveStock(
          connection,
          items
        );

        // Step 2: Calculate final pricing with current rates
        const orderSummary = await this._calculateAtomicOrderSummary(
          connection,
          validatedItems
        );

        // Step 3: Create order record
        const orderPayload = {
          userId,
          items: validatedItems,
          totalAmount: orderSummary.total,
          currency: orderSummary.currency,
          shippingAddress,
          billingAddress: billingAddress || shippingAddress,
          contactPhone: contactPhone || shippingAddress.phone,
          contactEmail: contactEmail || "",
          paymentMethod,
          paymentStatus: paymentMethod === "cod" ? "pending" : "pending",
          status: "initialized",
          metadata: {
            ...metadata,
            orderSummary,
            stockReservation: validatedItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              reservedQuantity: item.quantity,
              reservedAt: new Date().toISOString(),
            })),
          },
        };

        const order = await this.orderRepository.createWithConnection(
          connection,
          orderPayload
        );

        // Step 4: Create initial order event (with error handling for missing table)
        try {
          if (this.orderEventRepository) {
            await this.orderEventRepository.createWithConnection(connection, {
              orderId: order.id,
              previousStatus: null,
              newStatus: "initialized",
              changedBy: userId,
              note: "Order created successfully",
              metadata: {
                source: metadata.source || "web",
                deviceInfo: metadata.deviceInfo,
              },
            });
          }
        } catch (eventError) {
          // Log the error but don't fail the order creation
          logger.warn("Failed to create order event (table may not exist)", {
            orderId: order.id,
            error: eventError.message,
          });
        }

        // Step 5: Update product stock levels
        await this._updateStockLevels(connection, validatedItems);

        logger.info("Atomic order creation completed successfully", {
          orderId: order.id,
          itemCount: validatedItems.length,
          totalAmount: order.totalAmount,
        });

        return order;
      } catch (error) {
        logger.error(
          "Atomic order creation failed, transaction will rollback",
          {
            error: error.message,
            userId,
            itemCount: items.length,
          }
        );
        throw error;
      }
    });
  }

  /**
   * Validate stock availability and reserve stock atomically
   */
  async _validateAndReserveStock(connection, items) {
    const validatedItems = [];
    const stockErrors = [];

    for (const item of items) {
      try {
        let product = null;

        // Get current product/variant information using Supabase client methods
        if (item.variantId) {
          // Get product with variant data
          const { data: productData, error: productError } = await connection
            .from("products")
            .select(
              `
              *,
              product_variants!inner(
                id,
                price,
                stock,
                sku,
                metadata
              )
            `
            )
            .eq("id", item.productId)
            .eq("product_variants.id", item.variantId)
            .eq("is_active", true)
            .single();

          if (productError || !productData) {
            stockErrors.push(
              `Product ${item.productId} (variant ${item.variantId}) not found or inactive`
            );
            continue;
          }

          product = {
            ...productData,
            variant_stock: productData.product_variants[0]?.stock,
            variant_price: productData.product_variants[0]?.price,
            variant_sku: productData.product_variants[0]?.sku,
            variant_metadata: productData.product_variants[0]?.metadata,
          };
        } else {
          // Get product without variant
          const { data: productData, error: productError } = await connection
            .from("products")
            .select("*")
            .eq("id", item.productId)
            .eq("is_active", true)
            .single();

          if (productError || !productData) {
            stockErrors.push(`Product ${item.productId} not found or inactive`);
            continue;
          }

          product = productData;
        }

        const availableStock = item.variantId
          ? product.variant_stock
          : product.stock;
        const currentPrice = item.variantId
          ? product.variant_price || product.base_price
          : product.base_price;

        // Check stock availability
        if (availableStock < item.quantity) {
          stockErrors.push(
            `${product.title}: Insufficient stock. Available: ${availableStock}, Requested: ${item.quantity}`
          );
          continue;
        }

        // Validate minimum order quantity
        const minOrderQty = product.min_order_quantity || 1;
        if (item.quantity < minOrderQty) {
          stockErrors.push(
            `${product.title}: Minimum order quantity is ${minOrderQty}`
          );
          continue;
        }

        // Validate maximum order quantity
        const maxOrderQty = product.max_order_quantity || 1000;
        if (item.quantity > maxOrderQty) {
          stockErrors.push(
            `${product.title}: Maximum order quantity is ${maxOrderQty}`
          );
          continue;
        }

        // Build validated item with complete information
        const validatedItem = {
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          unitPrice: parseFloat(currentPrice),
          totalPrice: parseFloat(currentPrice) * item.quantity,
          sku: item.variantId
            ? product.variant_sku || product.sku
            : product.sku,
          title: product.title,
          productSnapshot: {
            title: product.title,
            description: product.description || product.short_description,
            basePrice: product.base_price,
            productType: product.product_type,
            category: product.category,
            brand: product.brand,
            image: product.image_url,
            weight: product.weight,
            dimensions: product.dimensions,
            ...(item.variantId && {
              variantInfo: {
                id: item.variantId,
                sku: product.variant_sku,
                price: product.variant_price,
                metadata: product.variant_metadata || {},
              },
            }),
          },
          retailerId: product.retailer_id,
          metadata: {
            stockReservedAt: new Date().toISOString(),
            originalStock: availableStock,
            reservedQuantity: item.quantity,
          },
        };

        validatedItems.push(validatedItem);
      } catch (error) {
        logger.error("Stock validation failed for item", {
          productId: item.productId,
          variantId: item.variantId,
          error: error.message,
        });
        stockErrors.push(
          `${item.productId}: Stock validation failed - ${error.message}`
        );
      }
    }

    if (stockErrors.length > 0) {
      throw new AppError(
        `Stock validation failed: ${stockErrors.join("; ")}`,
        409
      );
    }

    return validatedItems;
  }

  /**
   * Calculate order summary with current pricing atomically
   */
  async _calculateAtomicOrderSummary(connection, validatedItems) {
    let subtotal = 0;
    const itemDetails = [];
    const retailerGroups = new Map();

    for (const item of validatedItems) {
      subtotal += item.totalPrice;
      itemDetails.push(item);

      // Group by retailer for multi-retailer fee calculation
      const retailerId = item.retailerId || "default";
      if (!retailerGroups.has(retailerId)) {
        retailerGroups.set(retailerId, []);
      }
      retailerGroups.get(retailerId).push(item);
    }

    // Calculate fees and taxes with business rules
    const deliveryFee = this._calculateDeliveryFee(
      subtotal,
      retailerGroups.size
    );
    const platformFee = this._calculatePlatformFee(subtotal);
    const tax = this._calculateTax(subtotal);
    const discount = 0; // Placeholder for future discount logic

    const total = subtotal + deliveryFee + platformFee + tax - discount;

    return {
      items: itemDetails,
      subtotal: parseFloat(subtotal.toFixed(2)),
      deliveryFee: parseFloat(deliveryFee.toFixed(2)),
      platformFee: parseFloat(platformFee.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      currency: "INR",
      retailerCount: retailerGroups.size,
      savings: 0, // Placeholder for savings calculation
    };
  }

  /**
   * Update stock levels after successful order creation
   */
  async _updateStockLevels(connection, validatedItems) {
    for (const item of validatedItems) {
      try {
        if (item.variantId) {
          // Get current variant stock first
          const { data: variantData, error: fetchError } = await connection
            .from("product_variants")
            .select("stock")
            .eq("id", item.variantId)
            .single();

          if (fetchError || !variantData) {
            throw new Error(
              `Failed to fetch variant stock: ${
                fetchError?.message || "Variant not found"
              }`
            );
          }

          const newStock = variantData.stock - item.quantity;
          if (newStock < 0) {
            throw new Error(`Insufficient stock for variant ${item.variantId}`);
          }

          // Update variant stock
          const { error: variantError } = await connection
            .from("product_variants")
            .update({
              stock: newStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.variantId);

          if (variantError) {
            throw new Error(
              `Failed to update variant stock: ${variantError.message}`
            );
          }
        } else {
          // Get current product stock first
          const { data: productData, error: fetchError } = await connection
            .from("products")
            .select("stock")
            .eq("id", item.productId)
            .single();

          if (fetchError || !productData) {
            throw new Error(
              `Failed to fetch product stock: ${
                fetchError?.message || "Product not found"
              }`
            );
          }

          const newStock = productData.stock - item.quantity;
          if (newStock < 0) {
            throw new Error(`Insufficient stock for product ${item.productId}`);
          }

          // Update product stock
          const { error: productError } = await connection
            .from("products")
            .update({
              stock: newStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.productId);

          if (productError) {
            throw new Error(
              `Failed to update product stock: ${productError.message}`
            );
          }
        }

        logger.debug("Stock updated successfully", {
          productId: item.productId,
          variantId: item.variantId,
          quantityReduced: item.quantity,
        });
      } catch (error) {
        logger.error("Failed to update stock levels", {
          productId: item.productId,
          variantId: item.variantId,
          error: error.message,
        });
        throw new AppError("Failed to update stock levels", 500);
      }
    }
  }

  /**
   * Get order by ID with complete details
   */
  async getOrder(orderId, userId = null) {
    try {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found", 404);
      }

      // Check if user has access to this order
      if (userId && order.userId !== userId) {
        throw new AppError("You don't have access to this order", 403);
      }

      // Get order events for complete tracking
      const events = await this.orderEventRepository.findByOrderId(orderId);
      order.events = events;

      return order;
    } catch (error) {
      logger.error("Error getting order:", error);
      throw error;
    }
  }

  /**
   * Get user orders with enhanced filtering
   */
  async getUserOrders(userId, filters = {}) {
    try {
      // Validate user exists
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      const orders = await this.orderRepository.getByUser(userId, filters);

      console.log("getUserOrders - fetched orders:", orders);

      // Add event counts for each order
      for (const order of orders.orders || orders) {
        const eventCount = await this.orderEventRepository.countByOrderId(
          order.id
        );
        order.eventCount = eventCount;
      }

      return orders;
    } catch (error) {
      logger.error("Error getting user orders:", error);
      throw error;
    }
  }

  /**
   * Search orders with enhanced capabilities
   */
  async searchOrders(filters) {
    try {
      // Validate and sanitize filters
      const validStatuses = [
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
      ];

      if (filters.status && !validStatuses.includes(filters.status)) {
        throw new AppError(
          `Invalid status filter. Must be one of: ${validStatuses.join(", ")}`,
          400
        );
      }

      const validPaymentStatuses = ["pending", "paid", "failed", "refunded"];
      if (
        filters.paymentStatus &&
        !validPaymentStatuses.includes(filters.paymentStatus)
      ) {
        throw new AppError(
          `Invalid payment status. Must be one of: ${validPaymentStatuses.join(
            ", "
          )}`,
          400
        );
      }

      return await this.orderRepository.search(filters);
    } catch (error) {
      logger.error("Error searching orders:", error);
      throw error;
    }
  }

  /**
   * Update order status with comprehensive event tracking
   */
  async updateOrderStatus(
    orderId,
    status,
    changedBy,
    note = null,
    metadata = {}
  ) {
    try {
      // Validate status
      const validStatuses = [
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
      ];

      if (!validStatuses.includes(status)) {
        throw new AppError(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          400
        );
      }

      // Get current order
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found", 404);
      }

      const currentStatus = order.status;

      // Validate status transitions
      if (!this._isValidStatusTransition(currentStatus, status)) {
        throw new AppError(
          `Invalid status transition from ${currentStatus} to ${status}`,
          400
        );
      }

      // Update order status
      const updatedOrder = await this.orderRepository.updateStatus(
        orderId,
        status,
        metadata
      );

      // Create order event
      await this.orderEventRepository.create({
        orderId,
        previousStatus: currentStatus,
        newStatus: status,
        changedBy,
        note,
        metadata,
      });

      // Handle special status updates
      if (status === "delivered") {
        await this._handleOrderDelivered(orderId);
      } else if (status === "cancelled") {
        await this._handleOrderCancelled(orderId, changedBy, note);
      }

      logger.info(
        `Order ${orderId} status updated from ${currentStatus} to ${status}`
      );
      return updatedOrder;
    } catch (error) {
      logger.error("Error updating order status:", error);
      throw error;
    }
  }

  /**
   * Cancel order with enhanced validation
   */
  async cancelOrder(orderId, userId, reason = "Cancelled by user") {
    try {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found", 404);
      }

      // Check permissions
      if (order.userId !== userId) {
        throw new AppError("You can only cancel your own orders", 403);
      }

      // Check if order can be cancelled
      const nonCancellableStatuses = [
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ];
      if (nonCancellableStatuses.includes(order.status)) {
        throw new AppError(
          `Cannot cancel order with status: ${order.status}`,
          400
        );
      }

      return await this.updateOrderStatus(orderId, "cancelled", userId, reason);
    } catch (error) {
      logger.error("Error cancelling order:", error);
      throw error;
    }
  }

  /**
   * Calculate order summary with enhanced pricing logic
   */
  async calculateOrderSummary(items) {
    if (!items || items.length === 0) {
      throw new AppError("Items are required to calculate order summary", 400);
    }

    let subtotal = 0;
    const itemDetails = [];
    const retailerGroups = new Map();

    try {
      for (const item of items) {
        // Validate item structure
        if (!item.productId || !item.quantity || item.quantity <= 0) {
          throw new AppError(
            "Invalid item: productId and positive quantity required",
            400
          );
        }

        const product = await this.productRepository.findById(item.productId);
        if (!product || !product.isActive) {
          throw new AppError(
            `Product ${item.productId} not found or inactive`,
            404
          );
        }

        // Check stock availability
        if (product.stock < item.quantity) {
          throw new AppError(
            `Insufficient stock for ${product.title}. Available: ${product.stock}`,
            400
          );
        }

        let price = product.basePrice;
        let sku = product.sku;
        let compareAtPrice = null;

        // Handle variant pricing
        if (item.variantId) {
          const variant = product.variants?.find(
            (v) => v.id === item.variantId
          );
          if (!variant) {
            throw new AppError(
              `Product variant not found for ${product.title}`,
              404
            );
          }

          // Check stock availability
          if (variant.stock < item.quantity) {
            throw new AppError(
              `Insufficient stock for ${product.title}. Available: ${variant.stock}`,
              400
            );
          }

          price = variant.price || product.basePrice;
          compareAtPrice = variant.compareAtPrice;
          sku = variant.sku || product.sku;
        }

        const itemTotal = price * item.quantity;
        subtotal += itemTotal;

        const itemDetail = {
          productId: item.productId,
          variantId: item.variantId,
          title: product.title,
          sku,
          quantity: item.quantity,
          unitPrice: price,
          compareAtPrice,
          totalPrice: itemTotal,
          retailerId: product.retailerId,
          productSnapshot: {
            type: product.productType,
            brand: product.brands?.[0]?.name,
            category: product.categories?.[0]?.name,
          },
        };

        itemDetails.push(itemDetail);

        // Group by retailer for potential multi-retailer orders
        if (!retailerGroups.has(product.retailerId)) {
          retailerGroups.set(product.retailerId, []);
        }
        retailerGroups.get(product.retailerId).push(itemDetail);
      }

      // Calculate fees and taxes
      const deliveryFee = this._calculateDeliveryFee(
        subtotal,
        retailerGroups.size
      );
      const platformFee = this._calculatePlatformFee(subtotal);
      const tax = this._calculateTax(subtotal);
      const total = subtotal + deliveryFee + platformFee + tax;

      return {
        items: itemDetails,
        subtotal,
        deliveryFee,
        platformFee,
        tax,
        total,
        currency: "INR",
        retailerCount: retailerGroups.size,
        savings: itemDetails.reduce(
          (sum, item) =>
            sum +
            (item.compareAtPrice
              ? (item.compareAtPrice - item.unitPrice) * item.quantity
              : 0),
          0
        ),
      };
    } catch (error) {
      logger.error("Error calculating order summary:", error);
      throw error;
    }
  }

  /**
   * Get order statistics with enhanced metrics
   */
  async getOrderStats(userId = null, filters = {}) {
    try {
      return await this.orderRepository.getStatistics(userId, filters);
    } catch (error) {
      logger.error("Error getting order statistics:", error);
      throw error;
    }
  }

  /**
   * Create order query for customer support
   */
  async createOrderQuery(orderId, userId, queryData) {
    try {
      // Validate order exists and user has access
      const order = await this.getOrder(orderId, userId);

      const query = await this.orderQueryRepository.create({
        orderId,
        userId,
        subject: queryData.subject,
        message: queryData.message,
        priority: queryData.priority || "normal",
        status: "open",
      });

      logger.info(`Order query created: ${query.id} for order: ${orderId}`);
      return query;
    } catch (error) {
      logger.error("Error creating order query:", error);
      throw error;
    }
  }

  /**
   * Get order queries
   */
  async getOrderQueries(orderId, userId) {
    try {
      // Validate access
      await this.getOrder(orderId, userId);

      return await this.orderQueryRepository.findByOrderId(orderId);
    } catch (error) {
      logger.error("Error getting order queries:", error);
      throw error;
    }
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(orderId, paymentStatus, paymentData = {}) {
    try {
      const validPaymentStatuses = ["pending", "paid", "failed", "refunded"];
      if (!validPaymentStatuses.includes(paymentStatus)) {
        throw new AppError(
          `Invalid payment status. Must be one of: ${validPaymentStatuses.join(
            ", "
          )}`,
          400
        );
      }

      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found", 404);
      }

      // Update payment status
      await this.orderRepository.updatePaymentStatus(
        orderId,
        paymentStatus,
        paymentData
      );

      // Auto-update order status based on payment
      if (paymentStatus === "paid" && order.status === "initialized") {
        await this.updateOrderStatus(
          orderId,
          "processed",
          null,
          "Payment confirmed - auto-processed"
        );
      }

      logger.info(
        `Payment status updated for order ${orderId}: ${paymentStatus}`
      );
      return true;
    } catch (error) {
      logger.error("Error updating payment status:", error);
      throw error;
    }
  }

  // Private helper methods

  _isValidStatusTransition(currentStatus, newStatus) {
    const transitions = {
      initialized: ["processed", "cancelled"],
      processed: ["shipped", "cancelled"],
      shipped: ["out_for_delivery", "delivered"],
      out_for_delivery: ["delivered", "shipped"], // Allow return to shipped
      delivered: ["refunded"], // Only allow refund after delivery
      cancelled: [], // No transitions from cancelled
      refunded: [], // No transitions from refunded
    };

    return transitions[currentStatus]?.includes(newStatus) || false;
  }

  _calculateDeliveryFee(subtotal, retailerCount) {
    // Free delivery above ₹500, additional fee for multi-retailer orders
    const baseFee = subtotal > 500 ? 0 : 50;
    const multiRetailerFee = retailerCount > 1 ? (retailerCount - 1) * 30 : 0;
    return baseFee + multiRetailerFee;
  }

  _calculatePlatformFee(subtotal) {
    // Flat platform fee
    return Math.min(30, subtotal * 0.02); // 2% or ₹30, whichever is lower
  }

  _calculateTax(subtotal) {
    // 18% GST
    return subtotal * 0.18;
  }

  async _handleOrderDelivered(orderId) {
    // Handle post-delivery logic (e.g., enable reviews, loyalty points)
    logger.info(`Order ${orderId} delivered - enabling post-delivery features`);
  }

  async _handleOrderCancelled(orderId, cancelledBy, reason) {
    // Handle cancellation logic (e.g., restock inventory, process refunds)
    logger.info(`Order ${orderId} cancelled by ${cancelledBy}: ${reason}`);

    try {
      // Restock inventory atomically
      await this._restockCancelledOrder(orderId);
    } catch (error) {
      logger.error("Failed to restock cancelled order", {
        orderId,
        error: error.message,
      });
    }
  }

  /**
   * Restock inventory when order is cancelled
   */
  async _restockCancelledOrder(orderId) {
    return await this.orderRepository.executeTransaction(async (connection) => {
      // Get order items
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found for restocking", 404);
      }

      // Restock each item using Supabase operations
      for (const item of order.items) {
        try {
          if (item.variantId) {
            // Get current variant stock first
            const { data: variantData, error: fetchError } = await connection
              .from("product_variants")
              .select("stock")
              .eq("id", item.variantId)
              .single();

            if (fetchError || !variantData) {
              throw new Error(
                `Failed to fetch variant stock for restocking: ${
                  fetchError?.message || "Variant not found"
                }`
              );
            }

            const newStock = variantData.stock + item.quantity;

            // Update variant stock
            const { error: variantError } = await connection
              .from("product_variants")
              .update({
                stock: newStock,
                updated_at: new Date().toISOString(),
              })
              .eq("id", item.variantId);

            if (variantError) {
              throw new Error(
                `Failed to restock variant: ${variantError.message}`
              );
            }
          } else {
            // Get current product stock first
            const { data: productData, error: fetchError } = await connection
              .from("products")
              .select("stock")
              .eq("id", item.productId)
              .single();

            if (fetchError || !productData) {
              throw new Error(
                `Failed to fetch product stock for restocking: ${
                  fetchError?.message || "Product not found"
                }`
              );
            }

            const newStock = productData.stock + item.quantity;

            // Update product stock
            const { error: productError } = await connection
              .from("products")
              .update({
                stock: newStock,
                updated_at: new Date().toISOString(),
              })
              .eq("id", item.productId);

            if (productError) {
              throw new Error(
                `Failed to restock product: ${productError.message}`
              );
            }
          }
        } catch (error) {
          logger.error("Failed to restock item", {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            error: error.message,
          });
          throw error;
        }
      }

      logger.info(
        `Successfully restocked ${order.items.length} items for cancelled order ${orderId}`
      );
    });
  }
}

export default OrderService;
