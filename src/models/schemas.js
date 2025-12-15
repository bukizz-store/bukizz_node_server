import Joi from "joi";

// Common validation patterns
const uuidSchema = Joi.string().uuid().required();
const optionalUuidSchema = Joi.string().uuid().optional();
const emailSchema = Joi.string().email().required();
const passwordSchema = Joi.string().min(6).max(128).required();
const phoneSchema = Joi.string()
  .pattern(/^\+?[\d\s\-\(\)]{10,}$/)
  .optional();

/**
 * User validation schemas
 */
export const userSchemas = {
  register: Joi.object({
    email: emailSchema,
    password: passwordSchema,
    fullName: Joi.string().min(2).max(255).required(),
    phone: phoneSchema,
    provider: Joi.string().valid("email", "google").default("email"),
  }),

  login: Joi.object({
    email: emailSchema,
    password: passwordSchema,
  }),

  googleAuth: Joi.object({
    provider: Joi.string().valid("google").required(),
    providerUserId: Joi.string().required(),
    email: emailSchema,
    fullName: Joi.string().min(2).max(255).required(),
    providerData: Joi.object().optional(),
  }),

  updateProfile: Joi.object({
    fullName: Joi.string().min(2).max(255).optional(),
    phone: phoneSchema,
    metadata: Joi.object().optional(),
  }),

  forgotPassword: Joi.object({
    email: emailSchema,
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: passwordSchema,
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

/**
 * Brand validation schemas
 */
export const brandSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    slug: Joi.string().min(2).max(255).required(),
    description: Joi.string().optional(),
    country: Joi.string().max(100).optional(),
    logoUrl: Joi.string().uri().optional(),
    metadata: Joi.object().optional(),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    slug: Joi.string().min(2).max(255).optional(),
    description: Joi.string().optional(),
    country: Joi.string().max(100).optional(),
    logoUrl: Joi.string().uri().optional(),
    metadata: Joi.object().optional(),
    isActive: Joi.boolean().optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(255).optional(),
    country: Joi.string().max(100).optional(),
    sortBy: Joi.string().valid("createdAt", "name").default("name"),
    sortOrder: Joi.string().valid("asc", "desc").default("asc"),
  }),
};

/**
 * Category validation schemas
 */
export const categorySchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    slug: Joi.string().min(2).max(255).required(),
    description: Joi.string().optional(),
    parentId: optionalUuidSchema,
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    slug: Joi.string().min(2).max(255).optional(),
    description: Joi.string().optional(),
    parentId: optionalUuidSchema,
    isActive: Joi.boolean().optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(255).optional(),
    parentId: optionalUuidSchema,
    sortBy: Joi.string().valid("createdAt", "name").default("name"),
    sortOrder: Joi.string().valid("asc", "desc").default("asc"),
  }),
};

/**
 * Product Option validation schemas
 */
export const productOptionSchemas = {
  createAttribute: Joi.object({
    productId: uuidSchema,
    name: Joi.string().min(1).max(100).required(),
    position: Joi.number().integer().min(1).max(3).required(),
    isRequired: Joi.boolean().default(true),
  }),

  createValue: Joi.object({
    attributeId: uuidSchema,
    value: Joi.string().min(1).max(255).required(),
    priceModifier: Joi.number().min(0).precision(2).default(0),
    sortOrder: Joi.number().integer().default(0),
  }),

  updateAttribute: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    isRequired: Joi.boolean().optional(),
  }),

  updateValue: Joi.object({
    value: Joi.string().min(1).max(255).optional(),
    priceModifier: Joi.number().min(0).precision(2).optional(),
    sortOrder: Joi.number().integer().optional(),
  }),
};

/**
 * Product Variant validation schemas
 */
export const productVariantSchemas = {
  create: Joi.object({
    productId: uuidSchema,
    sku: Joi.string().max(150).optional(),
    price: Joi.number().min(0).precision(2).optional(),
    compareAtPrice: Joi.number().min(0).precision(2).optional(),
    stock: Joi.number().integer().min(0).default(0),
    weight: Joi.number().min(0).precision(3).optional(),
    optionValue1: optionalUuidSchema,
    optionValue2: optionalUuidSchema,
    optionValue3: optionalUuidSchema,
    metadata: Joi.object().optional(),
  }),

  update: Joi.object({
    sku: Joi.string().max(150).optional(),
    price: Joi.number().min(0).precision(2).optional(),
    compareAtPrice: Joi.number().min(0).precision(2).optional(),
    stock: Joi.number().integer().min(0).optional(),
    weight: Joi.number().min(0).precision(3).optional(),
    optionValue1: optionalUuidSchema,
    optionValue2: optionalUuidSchema,
    optionValue3: optionalUuidSchema,
    metadata: Joi.object().optional(),
  }),
};

/**
 * Product validation schemas
 */
export const productSchemas = {
  create: Joi.object({
    sku: Joi.string().max(100).optional(),
    title: Joi.string().min(2).max(255).required(),
    shortDescription: Joi.string().max(512).optional(),
    description: Joi.string().optional(),
    productType: Joi.string()
      .valid("bookset", "uniform", "stationary", "general")
      .default("general"),
    basePrice: Joi.number().min(0).precision(2).required(),
    currency: Joi.string().length(3).default("INR"),
    retailerId: optionalUuidSchema,
    categoryIds: Joi.array().items(uuidSchema).optional(),
    brandIds: Joi.array().items(uuidSchema).optional(),
    metadata: Joi.object().optional(),
  }),

  update: Joi.object({
    sku: Joi.string().max(100).optional(),
    title: Joi.string().min(2).max(255).optional(),
    shortDescription: Joi.string().max(512).optional(),
    description: Joi.string().optional(),
    productType: Joi.string()
      .valid("bookset", "uniform", "stationary", "general")
      .optional(),
    basePrice: Joi.number().min(0).precision(2).optional(),
    currency: Joi.string().length(3).optional(),
    retailerId: optionalUuidSchema,
    isActive: Joi.boolean().optional(),
    metadata: Joi.object().optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(255).optional(),
    category: optionalUuidSchema,
    brand: optionalUuidSchema,
    productType: Joi.string()
      .valid("bookset", "uniform", "stationary", "general")
      .optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    schoolId: optionalUuidSchema,
    retailerId: optionalUuidSchema,
    sortBy: Joi.string()
      .valid("createdAt", "title", "basePrice", "rating")
      .default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),
};

/**
 * Product Image validation schemas
 */
export const productImageSchemas = {
  create: Joi.object({
    productId: uuidSchema,
    variantId: optionalUuidSchema,
    url: Joi.string().uri().required(),
    altText: Joi.string().max(255).optional(),
    sortOrder: Joi.number().integer().default(0),
    isPrimary: Joi.boolean().default(false),
  }),

  update: Joi.object({
    url: Joi.string().uri().optional(),
    altText: Joi.string().max(255).optional(),
    sortOrder: Joi.number().integer().optional(),
    isPrimary: Joi.boolean().optional(),
  }),
};

/**
 * Retailer validation schemas
 */
export const retailerSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    contactEmail: Joi.string().email().optional(),
    contactPhone: phoneSchema,
    address: Joi.object({
      line1: Joi.string().max(255).required(),
      line2: Joi.string().max(255).optional(),
      city: Joi.string().max(100).required(),
      state: Joi.string().max(100).required(),
      postalCode: Joi.string().max(30).required(),
      country: Joi.string().max(100).default("India"),
    }).optional(),
    website: Joi.string().uri().optional(),
    metadata: Joi.object().optional(),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    contactEmail: Joi.string().email().optional(),
    contactPhone: phoneSchema,
    address: Joi.object().optional(),
    website: Joi.string().uri().optional(),
    isVerified: Joi.boolean().optional(),
    metadata: Joi.object().optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(255).optional(),
    isVerified: Joi.boolean().optional(),
    sortBy: Joi.string().valid("createdAt", "name").default("name"),
    sortOrder: Joi.string().valid("asc", "desc").default("asc"),
  }),
};

/**
 * School validation schemas
 */
export const schoolSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    type: Joi.string()
      .valid("public", "private", "charter", "international", "other")
      .required(),
    board: Joi.string().max(100).optional(),
    address: Joi.object({
      line1: Joi.string().max(255).required(),
      line2: Joi.string().max(255).optional(),
      city: Joi.string().max(100).required(),
      state: Joi.string().max(100).required(),
      postalCode: Joi.string().max(30).required(),
      country: Joi.string().max(100).default("India"),
    }).required(),
    city: Joi.string().max(100).required(),
    state: Joi.string().max(100).required(),
    country: Joi.string().max(100).default("India"),
    postalCode: Joi.string().max(30).required(),
    contact: Joi.object({
      phone: phoneSchema,
      email: Joi.string().email().optional(),
      website: Joi.string().uri().optional(),
    }).optional(),
    phone: phoneSchema,
    email: Joi.string().email().optional(),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    type: Joi.string()
      .valid("public", "private", "charter", "international", "other")
      .optional(),
    board: Joi.string().max(100).optional(),
    address: Joi.object({
      line1: Joi.string().max(255).optional(),
      line2: Joi.string().max(255).optional(),
      city: Joi.string().max(100).optional(),
      state: Joi.string().max(100).optional(),
      postalCode: Joi.string().max(30).optional(),
      country: Joi.string().max(100).optional(),
    }).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional(),
    postalCode: Joi.string().max(30).optional(),
    contact: Joi.object().optional(),
    phone: phoneSchema,
    email: Joi.string().email().optional(),
    isActive: Joi.boolean().optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(255).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    type: Joi.string()
      .valid("public", "private", "charter", "international", "other")
      .optional(),
    board: Joi.string()
      .valid("CBSE", "ICSE", "State Board", "IB", "IGCSE", "Other")
      .optional(),
    lat: Joi.number().optional(),
    lng: Joi.number().optional(),
    radius: Joi.number().min(1).max(100).optional(),
    sortBy: Joi.string()
      .valid("createdAt", "name", "city", "type")
      .default("name"),
    sortOrder: Joi.string().valid("asc", "desc").default("asc"),
  }),

  productAssociation: Joi.object({
    grade: Joi.string()
      .valid(
        "Pre-KG",
        "LKG",
        "UKG",
        "1st",
        "2nd",
        "3rd",
        "4th",
        "5th",
        "6th",
        "7th",
        "8th",
        "9th",
        "10th",
        "11th",
        "12th"
      )
      .required(),
    mandatory: Joi.boolean().default(false),
  }),

  updateProductAssociation: Joi.object({
    mandatory: Joi.boolean().optional(),
  }),

  partnership: Joi.object({
    partnerName: Joi.string().min(2).max(255).required(),
    partnerType: Joi.string()
      .valid("retailer", "supplier", "logistics", "educational", "other")
      .required(),
    contactEmail: Joi.string().email().optional(),
    contactPhone: phoneSchema,
    description: Joi.string().optional(),
    metadata: Joi.object().optional(),
  }),
};

/**
 * Order validation schemas
 */
export const orderSchemas = {
  createOrder: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          productId: uuidSchema,
          variantId: optionalUuidSchema,
          quantity: Joi.number().integer().min(1).max(1000).required(),
        })
      )
      .min(1)
      .max(50) // Maximum 50 items per order
      .required(),
    shippingAddress: Joi.object({
      recipientName: Joi.string().min(2).max(255).required(),
      phone: phoneSchema.required(),
      line1: Joi.string().max(255).required(),
      line2: Joi.string().max(255).optional(),
      city: Joi.string().max(100).required(),
      state: Joi.string().max(100).required(),
      postalCode: Joi.string()
        .pattern(/^\d{6}$/)
        .required(),
      country: Joi.string().max(100).default("India"),
      landmark: Joi.string().max(255).optional(),
    }).required(),
    billingAddress: Joi.object({
      recipientName: Joi.string().min(2).max(255).required(),
      phone: phoneSchema.required(),
      line1: Joi.string().max(255).required(),
      line2: Joi.string().max(255).optional(),
      city: Joi.string().max(100).required(),
      state: Joi.string().max(100).required(),
      postalCode: Joi.string()
        .pattern(/^\d{6}$/)
        .required(),
      country: Joi.string().max(100).default("India"),
      landmark: Joi.string().max(255).optional(),
    }).optional(),
    contactPhone: phoneSchema.optional(),
    contactEmail: Joi.string().email().optional(),
    paymentMethod: Joi.string()
      .valid("cod", "upi", "card", "netbanking", "wallet")
      .default("cod"),
    notes: Joi.string().max(500).optional(),
    metadata: Joi.object().optional(),
  }),

  calculateSummary: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          productId: uuidSchema,
          variantId: optionalUuidSchema,
          quantity: Joi.number().integer().min(1).max(1000).required(),
        })
      )
      .min(1)
      .max(50)
      .required(),
  }),

  updateStatus: Joi.object({
    status: Joi.string()
      .valid(
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded"
      )
      .required(),
    note: Joi.string().max(1000).optional(),
    metadata: Joi.object().optional(),
  }),

  cancelOrder: Joi.object({
    reason: Joi.string().max(500).default("Cancelled by user"),
    refundRequested: Joi.boolean().default(false),
  }),

  updatePayment: Joi.object({
    paymentStatus: Joi.string()
      .valid("pending", "paid", "failed", "refunded")
      .required(),
    paymentId: Joi.string().max(255).optional(),
    paymentMethod: Joi.string()
      .valid("cod", "upi", "card", "netbanking", "wallet")
      .optional(),
    transactionId: Joi.string().max(255).optional(),
    paymentData: Joi.object().optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string()
      .valid(
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded"
      )
      .optional(),
    paymentStatus: Joi.string()
      .valid("pending", "paid", "failed", "refunded")
      .optional(),
    userId: optionalUuidSchema,
    retailerId: optionalUuidSchema,
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional(),
    search: Joi.string().max(255).optional(), // Search by order number or customer name
    sortBy: Joi.string()
      .valid("createdAt", "totalAmount", "status", "orderNumber")
      .default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),

  // Track order validation
  trackOrder: Joi.object({
    orderId: uuidSchema,
  }),

  // Bulk operations validation
  bulkUpdate: Joi.object({
    orderIds: Joi.array().items(uuidSchema).min(1).max(100).required(),
    status: Joi.string()
      .valid("processed", "shipped", "out_for_delivery", "delivered")
      .required(),
    note: Joi.string().max(1000).optional(),
  }),
};

/**
 * Order Event validation schemas
 */
export const orderEventSchemas = {
  create: Joi.object({
    orderId: uuidSchema,
    previousStatus: Joi.string()
      .valid(
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded"
      )
      .optional(),
    newStatus: Joi.string()
      .valid(
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded"
      )
      .required(),
    changedBy: optionalUuidSchema,
    note: Joi.string().max(1000).optional(),
    metadata: Joi.object().optional(),
    location: Joi.object({
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      address: Joi.string().max(500).optional(),
    }).optional(),
  }),

  query: Joi.object({
    orderId: optionalUuidSchema,
    userId: optionalUuidSchema,
    status: Joi.string()
      .valid(
        "initialized",
        "processed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded"
      )
      .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid("createdAt").default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),
};

/**
 * Order Query/Support validation schemas
 */
export const orderQuerySchemas = {
  createOrderQuery: Joi.object({
    subject: Joi.string().min(5).max(255).required(),
    message: Joi.string().min(10).max(2000).required(),
    priority: Joi.string()
      .valid("low", "normal", "high", "urgent")
      .default("normal"),
    category: Joi.string()
      .valid("delivery", "product", "payment", "refund", "general")
      .default("general"),
    attachments: Joi.array()
      .items(
        Joi.object({
          filename: Joi.string().required(),
          url: Joi.string().uri().required(),
          mimeType: Joi.string().optional(),
          size: Joi.number().integer().min(1).optional(),
        })
      )
      .max(5)
      .optional(),
  }),

  updateOrderQuery: Joi.object({
    subject: Joi.string().min(5).max(255).optional(),
    message: Joi.string().min(10).max(2000).optional(),
    status: Joi.string()
      .valid("open", "pending", "resolved", "closed")
      .optional(),
    priority: Joi.string().valid("low", "normal", "high", "urgent").optional(),
    assignedTo: optionalUuidSchema,
    resolutionNote: Joi.string().max(1000).optional(),
    attachments: Joi.array()
      .items(
        Joi.object({
          filename: Joi.string().required(),
          url: Joi.string().uri().required(),
          mimeType: Joi.string().optional(),
          size: Joi.number().integer().min(1).optional(),
        })
      )
      .max(5)
      .optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    orderId: optionalUuidSchema,
    userId: optionalUuidSchema,
    assignedTo: optionalUuidSchema,
    status: Joi.string()
      .valid("open", "pending", "resolved", "closed")
      .optional(),
    priority: Joi.string().valid("low", "normal", "high", "urgent").optional(),
    category: Joi.string()
      .valid("delivery", "product", "payment", "refund", "general")
      .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    search: Joi.string().max(255).optional(),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "priority", "status")
      .default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),
};

/**
 * Review validation schemas
 */
export const reviewSchemas = {
  create: Joi.object({
    productId: uuidSchema,
    orderItemId: optionalUuidSchema,
    rating: Joi.number().integer().min(1).max(5).required(),
    title: Joi.string().max(255).optional(),
    body: Joi.string().optional(),
    images: Joi.array().items(Joi.string().uri()).optional(),
  }),

  update: Joi.object({
    rating: Joi.number().integer().min(1).max(5).optional(),
    title: Joi.string().max(255).optional(),
    body: Joi.string().optional(),
    images: Joi.array().items(Joi.string().uri()).optional(),
    isPublished: Joi.boolean().optional(),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    productId: optionalUuidSchema,
    userId: optionalUuidSchema,
    rating: Joi.number().integer().min(1).max(5).optional(),
    verifiedPurchase: Joi.boolean().optional(),
    isPublished: Joi.boolean().optional(),
    sortBy: Joi.string().valid("createdAt", "rating").default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),
};

/**
 * Address validation schemas
 */
export const addressSchemas = {
  create: Joi.object({
    label: Joi.string().max(50).optional(),
    recipientName: Joi.string().max(255).required(),
    phone: phoneSchema.required(),
    line1: Joi.string().max(255).required(),
    line2: Joi.string().max(255).optional(),
    city: Joi.string().max(100).required(),
    state: Joi.string().max(100).required(),
    postalCode: Joi.string().max(30).required(),
    country: Joi.string().max(100).default("India"),
    isDefault: Joi.boolean().default(false),
    lat: Joi.number().optional(),
    lng: Joi.number().optional(),
  }),

  update: Joi.object({
    label: Joi.string().max(50).optional(),
    recipientName: Joi.string().max(255).optional(),
    phone: phoneSchema,
    line1: Joi.string().max(255).optional(),
    line2: Joi.string().max(255).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    postalCode: Joi.string().max(30).optional(),
    country: Joi.string().max(100).optional(),
    isDefault: Joi.boolean().optional(),
    isActive: Joi.boolean().optional(),
    lat: Joi.number().optional(),
    lng: Joi.number().optional(),
  }),
};

/**
 * Common parameter schemas
 */
export const paramSchemas = {
  id: Joi.object({
    id: uuidSchema,
  }),

  userId: Joi.object({
    userId: uuidSchema,
  }),

  productId: Joi.object({
    productId: uuidSchema,
  }),

  orderId: Joi.object({
    orderId: uuidSchema,
  }),

  schoolId: Joi.object({
    schoolId: uuidSchema,
  }),

  categorySlug: Joi.object({
    categorySlug: Joi.string().min(1).max(100).required(),
  }),

  categoryId: Joi.object({
    categoryId: Joi.string().min(1).max(100).required(),
  }),

  brandId: Joi.object({
    brandId: uuidSchema,
  }),

  variantId: Joi.object({
    variantId: uuidSchema,
  }),

  attributeId: Joi.object({
    attributeId: uuidSchema,
  }),

  valueId: Joi.object({
    valueId: uuidSchema,
  }),

  imageId: Joi.object({
    imageId: uuidSchema,
  }),

  productType: Joi.object({
    productType: Joi.string()
      .valid("bookset", "uniform", "stationary", "general")
      .required(),
  }),

  // Combined parameter schemas for routes with multiple parameters
  idAndBrandId: Joi.object({
    id: uuidSchema,
    brandId: uuidSchema,
  }),

  idAndImageId: Joi.object({
    id: uuidSchema,
    imageId: uuidSchema,
  }),

  city: Joi.object({
    city: Joi.string().min(1).max(100).required(),
  }),

  grade: Joi.object({
    grade: Joi.string()
      .valid(
        "Pre-KG",
        "LKG",
        "UKG",
        "1st",
        "2nd",
        "3rd",
        "4th",
        "5th",
        "6th",
        "7th",
        "8th",
        "9th",
        "10th",
        "11th",
        "12th"
      )
      .required(),
  }),
};
