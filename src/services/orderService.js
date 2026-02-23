import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { productPaymentMethodRepository } from "../repositories/productPaymentMethodRepository.js";
import { variantCommissionRepository } from "../repositories/variantCommissionRepository.js";

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
    orderQueryRepository,
    warehouseRepository,
    ledgerRepository,
  ) {
    this.orderRepository = orderRepository;
    this.productRepository = productRepository;
    this.userRepository = userRepository;
    this.orderEventRepository = orderEventRepository;
    this.orderQueryRepository = orderQueryRepository;
    this.warehouseRepository = warehouseRepository;
    this.ledgerRepository = ledgerRepository;
    this.productPaymentMethodRepository = productPaymentMethodRepository;
    this.variantCommissionRepository = variantCommissionRepository;
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
        contactEmail,
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
    contactEmail,
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
              `Item ${i + 1}: Quantity exceeds maximum limit (1000)`,
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
            "Invalid postal code format. Expected 6 digits.",
          );
        }

        // Validate required contact information in address or separately
        if (!shippingAddress.recipientName) {
          validationErrors.push(
            "Recipient name is required in shipping address",
          );
        }

        if (!shippingAddress.phone && !contactPhone) {
          validationErrors.push("Contact phone number is required");
        }
      }

      // 4. Validate payment method dynamically against product settings
      if (!paymentMethod) {
        validationErrors.push("Payment method is required");
      } else {
        // Collect product IDs
        const productIds = items.map((i) => i.productId).filter(Boolean);
        if (productIds.length > 0) {
          // Check payment methods for each product
          for (const pid of productIds) {
            const allowedMethods =
              await this.productPaymentMethodRepository.getPaymentMethods(pid);
            if (allowedMethods && allowedMethods.length > 0) {
              if (!allowedMethods.includes(paymentMethod)) {
                validationErrors.push(
                  `Product ${pid} does not accept payment method: ${paymentMethod}`,
                );
              }
            } else {
              // Fallback default if not explicitly set
              const defaultMethods = ["cod", "upi", "card"];
              if (!defaultMethods.includes(paymentMethod)) {
                validationErrors.push(
                  `Product ${pid} does not accept payment method: ${paymentMethod}`,
                );
              }
            }
          }
        }
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
          400,
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
              Object.getPrototypeOf(this.userRepository),
            )
          : "N/A",
      });

      if (error instanceof AppError) throw error;
      throw new AppError(
        `Order validation failed due to system error: ${error.message}`,
        500,
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
        // Batch-resolve warehouse IDs for all products in one query
        const productIds = items.map((item) => item.productId).filter(Boolean);
        const warehouseMap =
          await this.warehouseRepository.getWarehouseIdsByProductIds(
            productIds,
          );

        const validatedItems = await this._validateAndReserveStock(
          connection,
          items,
          warehouseMap,
        );

        // Step 2: Calculate final pricing with current rates
        const orderSummary = await this._calculateAtomicOrderSummary(
          connection,
          validatedItems,
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
          orderPayload,
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
          },
        );
        throw error;
      }
    });
  }

  /**
   * Validate stock availability and reserve stock atomically
   */
  async _validateAndReserveStock(connection, items, warehouseMap = new Map()) {
    const validatedItems = [];
    const stockErrors = [];

    for (const item of items) {
      try {
        let product = null;
        let imageUrl = null;

        // Helper to extract best image
        const getBestImage = (images) => {
          if (!images || images.length === 0) return null;
          const primary = images.find((img) => img.is_primary);
          if (primary) return primary.url;
          const sorted = [...images].sort(
            (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
          );
          return sorted[0]?.url;
        };

        // Get current product/variant information using Supabase client methods
        if (item.variantId) {
          // Get product with variant data and images
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
                metadata,
                compare_at_price
              ),
              product_images(url, is_primary, sort_order)
            `,
            )
            .eq("id", item.productId)
            .eq("product_variants.id", item.variantId)
            .eq("is_active", true)
            .single();

          if (productError || !productData) {
            stockErrors.push(
              `Product ${item.productId} (variant ${item.variantId}) not found or inactive`,
            );
            continue;
          }

          product = {
            ...productData,
            variant_stock: productData.product_variants[0]?.stock,
            variant_price: productData.product_variants[0]?.price,
            variant_compare_at_price:
              productData.product_variants[0]?.compare_at_price,
            variant_sku: productData.product_variants[0]?.sku,
            variant_metadata: productData.product_variants[0]?.metadata,
          };

          imageUrl = getBestImage(productData.product_images);
        } else {
          // Get product without variant
          const { data: productData, error: productError } = await connection
            .from("products")
            .select(
              `
              *,
              product_images(url, is_primary, sort_order)
            `,
            )
            .eq("id", item.productId)
            .eq("is_active", true)
            .single();

          if (productError || !productData) {
            stockErrors.push(`Product ${item.productId} not found or inactive`);
            continue;
          }

          product = productData;
          imageUrl = getBestImage(productData.product_images);
        }

        const availableStock = item.variantId
          ? product.variant_stock
          : product.stock;
        const currentPrice = item.variantId
          ? product.variant_price || product.base_price
          : product.base_price;

        // Calculate original price (MRP) for discount calculation
        const originalPrice = item.variantId
          ? product.variant_compare_at_price ||
            product.compare_at_price ||
            currentPrice
          : product.compare_at_price || currentPrice;

        // Fetch active commission for variant, if any
        let activeCommission = null;
        if (item.variantId) {
          try {
            activeCommission =
              await this.variantCommissionRepository.getActiveCommission(
                item.variantId,
              );
          } catch (commErr) {
            logger.warn(
              `Failed to fetch commission for variant ${item.variantId}`,
              commErr,
            );
          }
        }

        // Check stock availability
        if (availableStock < item.quantity) {
          stockErrors.push(
            `${product.title}: Insufficient stock. Available: ${availableStock}, Requested: ${item.quantity}`,
          );
          continue;
        }

        // Validate minimum order quantity
        const minOrderQty = product.min_order_quantity || 1;
        if (item.quantity < minOrderQty) {
          stockErrors.push(
            `${product.title}: Minimum order quantity is ${minOrderQty}`,
          );
          continue;
        }

        // Validate maximum order quantity
        const maxOrderQty = product.max_order_quantity || 1000;
        if (item.quantity > maxOrderQty) {
          stockErrors.push(
            `${product.title}: Maximum order quantity is ${maxOrderQty}`,
          );
          continue;
        }

        // Build validated item with complete information
        const validatedItem = {
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          unitPrice: parseFloat(currentPrice),
          originalPrice: parseFloat(originalPrice), // Store for calculation
          totalPrice: parseFloat(currentPrice) * item.quantity,
          sku: item.variantId
            ? product.variant_sku || product.sku
            : product.sku,
          title: product.title,
          deliveryCharge: parseFloat(product.delivery_charge) || 0,
          productSnapshot: {
            title: product.title,
            description: product.description || product.short_description,
            basePrice: product.base_price,
            compareAtPrice: product.compare_at_price,
            productType: product.product_type,
            category: product.category,
            brand: product.brand,
            image_url: imageUrl, // Populating the image field needed by frontend
            image: imageUrl, // Keeping for backward compatibility
            weight: product.weight,
            dimensions: product.dimensions,
            ...(item.variantId && {
              variantInfo: {
                id: item.variantId,
                sku: product.variant_sku,
                price: product.variant_price,
                metadata: product.variant_metadata || {},
                commission: activeCommission
                  ? {
                      type: activeCommission.commission_type,
                      value: parseFloat(activeCommission.commission_value),
                    }
                  : null,
              },
            }),
          },
          warehouseId: warehouseMap.get(item.productId) || null,
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
          `${item.productId}: Stock validation failed - ${error.message}`,
        );
      }
    }

    if (stockErrors.length > 0) {
      throw new AppError(
        `Stock validation failed: ${stockErrors.join("; ")}`,
        409,
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
    const warehouseGroups = new Map();
    let totalDeliveryCharge = 0;

    for (const item of validatedItems) {
      subtotal += item.totalPrice;
      totalDeliveryCharge += (item.deliveryCharge || 0) * item.quantity;
      itemDetails.push(item);

      // Group by warehouse for multi-warehouse fee calculation
      const warehouseId = item.warehouseId || "default";
      if (!warehouseGroups.has(warehouseId)) {
        warehouseGroups.set(warehouseId, []);
      }
      warehouseGroups.get(warehouseId).push(item);
    }

    // Calculate fees and taxes with business rules
    const deliveryFee = this._calculateDeliveryFee(
      subtotal,
      totalDeliveryCharge,
    );
    const platformFee = this._calculatePlatformFee(subtotal);
    const tax = this._calculateTax(subtotal);

    // Calculate Discount: (MRP * Qty) - (Selling Price * Qty)
    // Note: subtotal is already (Selling Price * Qty)
    const totalMRP = validatedItems.reduce(
      (sum, item) =>
        sum + (item.originalPrice || item.unitPrice) * item.quantity,
      0,
    );
    const discount = Math.max(0, totalMRP - subtotal);

    // Total = Subtotal + Fees - (Discount is ALREADY applied in subtotal because subtotal = selling price)
    // Wait, the frontend logic is: Total = Subtotal (Selling Price) + Fees.
    // The "Discount" is just for display: MRP - Selling Price.
    // So the stored Total Amount should be: Subtotal + Delivery + Platform + Tax (if extra, usually included).
    // Let's assume Tax is included in price or strictly additive?
    // In frontend: totalAmount = subtotal + platformFees + deliveryCharges.
    // Discount is NOT subtracted from Total, because Subtotal is ALREADY the discounted price.
    // The previous backend logic had: total = subtotal + ... - discount.
    // If backend "discount" variable was meant to be a COUPON discount, then subtracting it is correct.
    // But here we are talking about Product Discount (MRP - Price).
    // So we should NOT subtract `discount` if it represents Product Discount.
    // However, if we want to store the "Savings" value, we can return it.

    // Matched Frontend Logic:
    // Total = Subtotal + Platform Fee + Delivery Charges (Tax usually included or handled separately)
    // Ensuring Tax isn't double counted if included in price.
    // Previous logic: subtotal + delivery + platform + tax - discount.
    // I will align to: Total = Subtotal + Fees.

    const total = subtotal + deliveryFee + platformFee; // Tax assumed included in price or not added on top for now to match frontend

    return {
      items: itemDetails,
      subtotal: parseFloat(subtotal.toFixed(2)),
      deliveryFee: parseFloat(deliveryFee.toFixed(2)),
      platformFee: parseFloat(platformFee.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)), // Return product savings for display/analytics
      total: parseFloat(total.toFixed(2)),
      currency: "INR",
      warehouseCount: warehouseGroups.size,
      savings: parseFloat(discount.toFixed(2)),
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
              }`,
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
            })
            .eq("id", item.variantId);

          if (variantError) {
            throw new Error(
              `Failed to update variant stock: ${variantError.message}`,
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
              }`,
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
            })
            .eq("id", item.productId);

          if (productError) {
            throw new Error(
              `Failed to update product stock: ${productError.message}`,
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
        throw new AppError(
          `Failed to update stock levels: ${error.message}`,
          500,
        );
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
          order.id,
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
          400,
        );
      }

      const validPaymentStatuses = ["pending", "paid", "failed", "refunded"];
      if (
        filters.paymentStatus &&
        !validPaymentStatuses.includes(filters.paymentStatus)
      ) {
        throw new AppError(
          `Invalid payment status. Must be one of: ${validPaymentStatuses.join(
            ", ",
          )}`,
          400,
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
    metadata = {},
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
          400,
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
          400,
        );
      }

      // Update order status
      const updatedOrder = await this.orderRepository.updateStatus(
        orderId,
        status,
        metadata,
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
        `Order ${orderId} status updated from ${currentStatus} to ${status}`,
      );
      return updatedOrder;
    } catch (error) {
      logger.error("Error updating order status:", error);
      throw error;
    }
  }

  /**
   * Update order item status with event tracking
   */
  async updateOrderItemStatus(
    orderId,
    itemId,
    status,
    changedBy,
    note = null,
    metadata = {},
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
        "returned",
      ];

      if (!validStatuses.includes(status)) {
        throw new AppError(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          400,
        );
      }

      // Check order existence and access rights if needed
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found", 404);
      }

      // Find the item to ensure it belongs to the order
      const item = order.items.find((i) => i.id === itemId);
      if (!item) {
        throw new AppError("Order item not found in this order", 404);
      }

      const currentStatus = item.status;

      // Update item status
      const updatedItem = await this.orderRepository.updateOrderItemStatus(
        itemId,
        status,
      );

      // Create event
      await this.orderEventRepository.create({
        orderId,
        orderItemId: itemId,
        previousStatus: currentStatus,
        newStatus: status,
        changedBy,
        note: note || `Item status updated to ${status}`,
        metadata,
      });

      // ── Ledger trigger: create entries when item is delivered ──────────
      if (status === "delivered" && this.ledgerRepository) {
        try {
          await this._createDeliveryLedgerEntries(order, item);
        } catch (ledgerError) {
          logger.error("Failed to create ledger entries for delivered item", {
            orderId,
            itemId,
            error: ledgerError.message,
          });
          throw new AppError(
            `Ledger entry creation failed for item ${itemId}: ${ledgerError.message}`,
            500,
          );
        }
      }

      return updatedItem;
    } catch (error) {
      logger.error("Failed to update order item status:", error);
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
          400,
        );
      }

      return await this.updateOrderStatus(orderId, "cancelled", userId, reason);
    } catch (error) {
      logger.error("Error cancelling order:", error);
      throw error;
    }
  }

  /**
   * Cancel single order item with automated restocking and partial refund
   */
  async cancelOrderItem(orderId, itemId, userId, reason = "Cancelled by user") {
    try {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found", 404);
      }

      // Check permissions
      if (order.userId !== userId) {
        throw new AppError(
          "You can only cancel items from your own orders",
          403,
        );
      }

      const item = order.items.find((i) => i.id === itemId);
      if (!item) {
        throw new AppError("Item not found in order", 404);
      }

      // Check if item can be cancelled
      const nonCancellableStatuses = [
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
        "returned",
      ];

      if (nonCancellableStatuses.includes(item.status)) {
        throw new AppError(
          `Cannot cancel item with status: ${item.status}`,
          400,
        );
      }

      // 1. Update item status
      const updatedItem = await this.updateOrderItemStatus(
        orderId,
        itemId,
        "cancelled",
        userId,
        reason,
      );

      // 2. Restock inventory automatically
      try {
        await this._restockCancelledItem(item);
      } catch (restockError) {
        // Log but don't fail the cancellation
        logger.error("Failed to restock cancelled item", {
          orderId,
          itemId,
          error: restockError.message,
        });
      }

      // 3. Process partial refund (stub)
      try {
        await this._processPartialRefund(order, item, reason);
      } catch (refundError) {
        logger.error("Failed to process partial refund", {
          orderId,
          itemId,
          error: refundError.message,
        });
      }

      return updatedItem;
    } catch (error) {
      logger.error("Error cancelling order item:", error);
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
    const warehouseGroups = new Map();

    try {
      // Batch-resolve warehouse IDs for all products upfront
      const productIds = items.map((item) => item.productId).filter(Boolean);
      const warehouseMap =
        await this.warehouseRepository.getWarehouseIdsByProductIds(productIds);

      for (const item of items) {
        // Validate item structure
        if (!item.productId || !item.quantity || item.quantity <= 0) {
          throw new AppError(
            "Invalid item: productId and positive quantity required",
            400,
          );
        }

        const product = await this.productRepository.findById(item.productId);
        if (!product || !product.isActive) {
          throw new AppError(
            `Product ${item.productId} not found or inactive`,
            404,
          );
        }

        // Check stock availability
        if (product.stock < item.quantity) {
          throw new AppError(
            `Insufficient stock for ${product.title}. Available: ${product.stock}`,
            400,
          );
        }

        let price = product.basePrice;
        let sku = product.sku;
        let compareAtPrice = null;

        // Handle variant pricing
        if (item.variantId) {
          const variant = product.variants?.find(
            (v) => v.id === item.variantId,
          );
          if (!variant) {
            throw new AppError(
              `Product variant not found for ${product.title}`,
              404,
            );
          }

          // Check stock availability
          if (variant.stock < item.quantity) {
            throw new AppError(
              `Insufficient stock for ${product.title}. Available: ${variant.stock}`,
              400,
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
          warehouseId: warehouseMap.get(item.productId) || null,
          deliveryCharge:
            parseFloat(product.delivery_charge || product.deliveryCharge) || 0,
          productSnapshot: {
            type: product.productType,
            brand: product.brands?.[0]?.name,
            category: product.categories?.[0]?.name,
          },
        };

        itemDetails.push(itemDetail);

        // Group by warehouse for potential multi-warehouse orders
        const wId = itemDetail.warehouseId || "default";
        if (!warehouseGroups.has(wId)) {
          warehouseGroups.set(wId, []);
        }
        warehouseGroups.get(wId).push(itemDetail);
      }

      let totalDeliveryCharge = 0;
      for (const item of itemDetails) {
        totalDeliveryCharge += (item.deliveryCharge || 0) * item.quantity;
      }

      // Calculate fees and taxes
      const deliveryFee = this._calculateDeliveryFee(
        subtotal,
        totalDeliveryCharge,
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
        warehouseCount: warehouseGroups.size,
        savings: itemDetails.reduce(
          (sum, item) =>
            sum +
            (item.compareAtPrice
              ? (item.compareAtPrice - item.unitPrice) * item.quantity
              : 0),
          0,
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

  // ==========================================
  // RETAILER PORTAL - WAREHOUSE-WISE ORDER APIs
  // ==========================================

  /**
   * Get orders for a specific warehouse
   * Used by retailer portal to view orders warehouse-wise
   */
  async getOrdersByWarehouseId(warehouseId, retailerId, filters = {}) {
    try {
      if (!warehouseId) {
        throw new AppError("Warehouse ID is required", 400);
      }

      // Debug log: IDs being checked
      logger.info("Checking warehouse ownership", { retailerId, warehouseId });

      // Verify retailer owns this warehouse
      const isLinked = await this.warehouseRepository.isLinkedToRetailer(
        retailerId,
        warehouseId,
      );
      logger.info("isLinkedToRetailer result", {
        isLinked,
        retailerId,
        warehouseId,
      });
      if (!isLinked) {
        throw new AppError(
          "Access denied. You do not own this warehouse.",
          403,
        );
      }

      const result = await this.orderRepository.getByWarehouseId(
        warehouseId,
        filters,
      );

      logger.info("Fetched orders for warehouse", {
        warehouseId,
        retailerId,
        ordersCount: result.orders?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error("Error getting orders by warehouse:", error);
      throw error;
    }
  }

  /**
   * Get all orders across all warehouses for a retailer
   * Aggregates orders from all retailer's warehouses
   */
  async getRetailerOrders(retailerId, filters = {}) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }

      // Get all warehouse IDs for this retailer
      const warehouses =
        await this.warehouseRepository.findByRetailerId(retailerId);
      const warehouseIds = (warehouses || []).map((w) => w.id);

      if (warehouseIds.length === 0) {
        logger.info("Retailer has no warehouses", { retailerId });
        return {
          orders: [],
          pagination: {
            page: 1,
            limit: parseInt(filters.limit || 20),
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
          warehouseCount: 0,
        };
      }

      const result = await this.orderRepository.getByWarehouseIds(
        warehouseIds,
        filters,
      );
      result.warehouseCount = warehouseIds.length;

      logger.info("Fetched all retailer orders", {
        retailerId,
        warehouseCount: warehouseIds.length,
        ordersCount: result.orders?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error("Error getting retailer orders:", error);
      throw error;
    }
  }

  /**
   * Get order statistics for a specific warehouse
   */
  async getWarehouseOrderStats(warehouseId, retailerId, filters = {}) {
    try {
      if (!warehouseId) {
        throw new AppError("Warehouse ID is required", 400);
      }

      // Verify retailer owns this warehouse
      const isLinked = await this.warehouseRepository.isLinkedToRetailer(
        retailerId,
        warehouseId,
      );
      if (!isLinked) {
        throw new AppError(
          "Access denied. You do not own this warehouse.",
          403,
        );
      }

      const stats = await this.orderRepository.getWarehouseOrderStats(
        warehouseId,
        filters,
      );

      logger.info("Fetched warehouse order stats", {
        warehouseId,
        retailerId,
        totalOrders: stats.summary?.totalOrders,
      });

      return stats;
    } catch (error) {
      logger.error("Error getting warehouse order stats:", error);
      throw error;
    }
  }

  /**
   * Get aggregated order statistics across all retailer warehouses
   */
  async getRetailerOrderStats(retailerId, filters = {}) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }

      // Get all warehouse IDs for this retailer
      const warehouses =
        await this.warehouseRepository.findByRetailerId(retailerId);
      const warehouseIds = (warehouses || []).map((w) => w.id);

      if (warehouseIds.length === 0) {
        return {
          summary: {
            totalOrders: 0,
            totalRevenue: 0,
            averageOrderValue: 0,
            totalItems: 0,
          },
          byStatus: {},
          byPaymentStatus: {},
          byWarehouse: {},
          warehouseCount: 0,
        };
      }

      // Get stats per warehouse and aggregate
      const aggregated = {
        summary: {
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          totalItems: 0,
        },
        byStatus: {},
        byPaymentStatus: {},
        byWarehouse: {},
        warehouseCount: warehouseIds.length,
      };

      for (const warehouse of warehouses) {
        const warehouseStats =
          await this.orderRepository.getWarehouseOrderStats(
            warehouse.id,
            filters,
          );

        aggregated.summary.totalOrders += warehouseStats.summary.totalOrders;
        aggregated.summary.totalRevenue += warehouseStats.summary.totalRevenue;
        aggregated.summary.totalItems += warehouseStats.summary.totalItems;

        // Merge status counts
        for (const [status, data] of Object.entries(warehouseStats.byStatus)) {
          if (!aggregated.byStatus[status]) {
            aggregated.byStatus[status] = { count: 0, revenue: 0 };
          }
          aggregated.byStatus[status].count += data.count;
          aggregated.byStatus[status].revenue += data.revenue || 0;
        }

        // Merge payment status counts
        for (const [pStatus, data] of Object.entries(
          warehouseStats.byPaymentStatus,
        )) {
          if (!aggregated.byPaymentStatus[pStatus]) {
            aggregated.byPaymentStatus[pStatus] = { count: 0 };
          }
          aggregated.byPaymentStatus[pStatus].count += data.count;
        }

        // Per-warehouse breakdown
        aggregated.byWarehouse[warehouse.id] = {
          name: warehouse.name,
          ...warehouseStats.summary,
        };
      }

      // Calculate overall average
      if (aggregated.summary.totalOrders > 0) {
        aggregated.summary.averageOrderValue = parseFloat(
          (
            aggregated.summary.totalRevenue / aggregated.summary.totalOrders
          ).toFixed(2),
        );
      }

      return aggregated;
    } catch (error) {
      logger.error("Error getting retailer order stats:", error);
      throw error;
    }
  }

  /**
   * Get a specific order detail for retailer (validates warehouse ownership)
   */
  async getRetailerOrderById(orderId, retailerId) {
    try {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new AppError("Order not found", 404);
      }

      // Check if any order item belongs to retailer's warehouses
      // Items with NULL warehouse_id belong to the warehouse set on the order itself
      const warehouses =
        await this.warehouseRepository.findByRetailerId(retailerId);
      const warehouseIds = new Set((warehouses || []).map((w) => w.id));
      const orderWarehouseId = order.warehouseId;

      const isRetailerItem = (item) =>
        warehouseIds.has(item.warehouseId) ||
        (!item.warehouseId && warehouseIds.has(orderWarehouseId));

      const hasAccess = order.items?.some(isRetailerItem);

      if (!hasAccess) {
        throw new AppError(
          "Access denied. This order does not belong to your warehouses.",
          403,
        );
      }

      // Filter items to only show retailer's warehouse items
      order.items = order.items.filter(isRetailerItem);

      return order;
    } catch (error) {
      logger.error("Error getting retailer order by ID:", error);
      throw error;
    }
  }

  /**
   * Get a single order item detail for warehouse view
   * Validates warehouse ownership and returns item + parent order data
   */
  async getWarehouseOrderItem(itemId, warehouseId) {
    try {
      if (!itemId) {
        throw new AppError("Order item ID is required", 400);
      }
      if (!warehouseId) {
        throw new AppError("Warehouse ID is required", 400);
      }

      // Fetch the order item
      const item = await this.orderRepository.findOrderItemById(itemId);
      if (!item) {
        throw new AppError("Order item not found", 404);
      }

      // Validate warehouse ownership
      if (item.warehouseId && item.warehouseId !== warehouseId) {
        throw new AppError(
          "Access denied. This item does not belong to your warehouse.",
          403,
        );
      }

      // Fetch parent order
      const order = await this.orderRepository.findById(item._orderId);
      if (!order) {
        throw new AppError("Parent order not found", 404);
      }

      // For items with NULL warehouse_id, check the order-level warehouse_id
      if (!item.warehouseId && order.warehouseId !== warehouseId) {
        throw new AppError(
          "Access denied. This item does not belong to your warehouse.",
          403,
        );
      }

      // Fetch item-level events
      const events = await this.orderRepository.getOrderItemEvents(itemId);

      // Compute canCancel: false if status is out_for_delivery, delivered, cancelled, refunded, returned
      const cancellableStatuses = ["initialized", "processed", "shipped"];
      const canCancel = cancellableStatuses.includes(item.status);

      // Compute canReturn: true only if delivered within 10 days
      let canReturn = false;
      if (item.status === "delivered") {
        const deliveredEvent = events.find((e) => e.newStatus === "delivered");
        if (deliveredEvent) {
          const returnWindow = 10 * 24 * 60 * 60 * 1000; // 10 days
          canReturn =
            Date.now() - new Date(deliveredEvent.createdAt).getTime() <
            returnWindow;
        }
      }

      // Tracking info
      const trackingInfo = {
        carrier: order.metadata?.carrier || "Local Delivery",
        trackingUrl: order.trackingNumber
          ? `https://track.bukizz.com/${order.trackingNumber}`
          : null,
      };

      // Build response
      const order_item_data = {
        id: item.id,
        sku: item.sku,
        title: item.title,
        quantity: item.quantity,
        productId: item.productId,
        variantId: item.variantId,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        warehouseId: item.warehouseId,
        dispatchId: item.dispatchId,
        status: item.status,
        schoolName: item.schoolName || null,
        variant: item.variant || null,
        productSnapshot: item.productSnapshot,
        events,
        canCancel,
        canReturn,
        trackingInfo,
      };

      const order_data = {
        id: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
        contactPhone: order.contactPhone,
        contactEmail: order.contactEmail,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      };

      return { order_item_data, order_data };
    } catch (error) {
      logger.error("Error getting warehouse order item:", error);
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
            ", ",
          )}`,
          400,
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
        paymentData,
      );

      // Auto-update order status based on payment
      if (paymentStatus === "paid" && order.status === "initialized") {
        await this.updateOrderStatus(
          orderId,
          "processed",
          null,
          "Payment confirmed - auto-processed",
        );
      }

      logger.info(
        `Payment status updated for order ${orderId}: ${paymentStatus}`,
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

  _calculateDeliveryFee(subtotal, totalDeliveryCharge) {
    // Free delivery above ₹399 (Frontend Logic)
    // Note: Frontend also has item-specific delivery charges.
    // Ideally, this service should receive the fully calculated delivery fee or replicate the precise logic.
    // For now, aligning the base logic:
    const baseFee = subtotal >= 399 ? 0 : 50;

    // Add product specific delivery charges instead of multi-warehouse fee
    return baseFee + totalDeliveryCharge;
  }

  _calculatePlatformFee(subtotal) {
    // Flat platform fee of ₹10 (Frontend Logic)
    return 10;
  }

  _calculateTax(subtotal) {
    // 18% GST (Included in price usually, returning 0 for additive tax unless specified)
    // Frontend doesn't add extra tax on top of subtotal + fees
    return 0; // subtotal * 0.18;
  }

  async _handleOrderDelivered(orderId) {
    logger.info(`Order ${orderId} delivered - enabling post-delivery features`);

    // Create ledger entries for all deliverable items in this order
    if (this.ledgerRepository) {
      try {
        const order = await this.orderRepository.findById(orderId);
        if (!order || !order.items) return;

        for (const item of order.items) {
          // Skip items that were already cancelled/refunded
          if (["cancelled", "refunded", "returned"].includes(item.status))
            continue;

          await this._createDeliveryLedgerEntries(order, item);
        }

        logger.info(`Ledger entries created for all items in order ${orderId}`);
      } catch (ledgerError) {
        logger.error("Failed to create ledger entries on order delivery", {
          orderId,
          error: ledgerError.message,
        });
        throw new AppError(
          `Ledger entry creation failed for order ${orderId}: ${ledgerError.message}`,
          500,
        );
      }
    }
  }

  /**
   * Create multi-line ledger entries for a delivered order item.
   *
   * Inserts two immutable rows:
   *   1. ORDER_REVENUE  (CREDIT) – the retailer's gross revenue.
   *   2. PLATFORM_FEE   (DEBIT)  – Bukizz's commission.
   *
   * Both start as PENDING with a trigger_date 3 days in the future.
   *
   * @param {Object} order - Full order object (from findById).
   * @param {Object} item  - The specific order item being delivered.
   */
  async _createDeliveryLedgerEntries(order, item) {
    const grossAmount = parseFloat(item.totalPrice || item.total_price || 0);
    if (grossAmount <= 0) {
      logger.warn("Skipping ledger creation: item has no positive amount", {
        orderId: order.id,
        itemId: item.id,
      });
      return;
    }

    // Commission rate from snapshot or default (flat ₹10 fallback)
    const commissionRate = item.commissionRate || item.commission_rate || 0;
    const platformFee =
      commissionRate > 0 ? grossAmount * (commissionRate / 100) : 10; // Flat ₹10 default matches OrderService._calculatePlatformFee

    // 3-day hold period before funds become AVAILABLE
    const triggerDate = new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const retailerId =
      order.retailerId || order.retailer_id || item.warehouseRetailerId;
    const warehouseId =
      item.warehouseId ||
      item.warehouse_id ||
      order.warehouseId ||
      order.warehouse_id;

    const ledgerEntries = [
      {
        retailer_id: retailerId,
        warehouse_id: warehouseId || null,
        order_id: order.id,
        order_item_id: item.id,
        transaction_type: "ORDER_REVENUE",
        entry_type: "CREDIT",
        amount: grossAmount,
        status: "PENDING",
        trigger_date: triggerDate,
      },
      {
        retailer_id: retailerId,
        warehouse_id: warehouseId || null,
        order_id: order.id,
        order_item_id: item.id,
        transaction_type: "PLATFORM_FEE",
        entry_type: "DEBIT",
        amount: platformFee,
        status: "PENDING",
        trigger_date: triggerDate,
      },
    ];

    await this.ledgerRepository.createEntries(ledgerEntries);

    logger.info("Delivery ledger entries created", {
      orderId: order.id,
      itemId: item.id,
      grossAmount,
      platformFee,
      triggerDate,
    });
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

    // Update all order items to cancelled
    try {
      const { createServiceClient } = await import("../db/index.js");
      const serviceClient = createServiceClient();
      const { error } = await serviceClient
        .from("order_items")
        .update({ status: "cancelled" })
        .eq("order_id", orderId)
        .neq("status", "cancelled");

      if (error) throw error;
      logger.info("Order items marked as cancelled", { orderId });
    } catch (error) {
      logger.error("Failed to update order items to cancelled", {
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
                }`,
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
                `Failed to restock variant: ${variantError.message}`,
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
                }`,
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
                `Failed to restock product: ${productError.message}`,
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
        `Successfully restocked ${order.items.length} items for cancelled order ${orderId}`,
      );
    });
  }

  /**
   * Restock a single item
   */
  async _restockCancelledItem(item) {
    if (!item) return;

    return await this.orderRepository.executeTransaction(async (connection) => {
      if (item.variantId) {
        // Get current variant stock
        const { data: variantData, error: fetchError } = await connection
          .from("product_variants")
          .select("stock")
          .eq("id", item.variantId)
          .single();

        if (fetchError || !variantData) {
          throw new Error(
            `Variant not found for restocking: ${item.variantId}`,
          );
        }

        const newStock = variantData.stock + item.quantity;

        // Update variant stock
        await connection
          .from("product_variants")
          .update({ stock: newStock })
          .eq("id", item.variantId);
      } else {
        // Get current product stock
        const { data: productData, error: fetchError } = await connection
          .from("products")
          .select("stock")
          .eq("id", item.productId)
          .single();

        if (fetchError || !productData) {
          throw new Error(
            `Product not found for restocking: ${item.productId}`,
          );
        }

        const newStock = productData.stock + item.quantity;

        // Update product stock
        await connection
          .from("products")
          .update({ stock: newStock })
          .eq("id", item.productId);
      }

      logger.info(`Restocked item: ${item.title} (Qty: ${item.quantity})`);
    });
  }

  /**
   * Process partial refund (Stub)
   */
  async _processPartialRefund(order, item, reason) {
    // This is a placeholder for actual payment gateway integration
    // In a real implementation, you would:
    // 1. Check payment status (if paid)
    // 2. Call Razorpay/Stripe API to refund 'item.totalPrice'
    // 3. Update order payment record

    if (order.paymentStatus === "paid") {
      logger.info(
        `[REFUND REQUIRED] Process partial refund of ₹${item.totalPrice} for Item ${item.id} in Order ${order.id}`,
      );
      logger.info(`Refund Reason: ${reason}`);

      // We could ideally create a 'refund_request' record in DB here
    } else {
      logger.info(
        `Skipping refund for Item ${item.id} - Order payment status is ${order.paymentStatus}`,
      );
    }
  }
}

export default OrderService;
