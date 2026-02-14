# Bukizz Node Server — Complete Context Document

## 1. Project Overview

**Bukizz** is a **school e-commerce platform** API backend. It enables parents/students to purchase school supplies (books, uniforms, stationery) online, organized by school and grade. The platform supports three user roles: **Customer**, **Retailer**, and **Admin**.

| Attribute | Value |
|---|---|
| **Runtime** | Node.js ≥ 18 (ES Modules) |
| **Framework** | Express 4.18 |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | JWT (custom) + Supabase Auth (Google OAuth) |
| **Payments** | Razorpay |
| **Validation** | Joi |
| **File Uploads** | Multer (memory storage → Supabase Storage) |
| **Logging** | Winston (file + console) |
| **Security** | Helmet, CORS, express-rate-limit, bcryptjs |
| **Email** | Nodemailer |
| **Containerization** | Docker + docker-compose |

---

## 2. Folder Structure

```
bukizz_node_server/
├── index.js                    # Main entry point — boots server, wires DI, legacy auth routes
├── package.json                # Dependencies & scripts
├── Dockerfile                  # Docker image config
├── docker-compose.yml          # Multi-service orchestration
├── healthcheck.js              # Container health check
├── .env / .env.example         # Environment variables
├── nodemon.json                # Dev server config
├── postman.json                # Postman collection
├── scripts/
│   ├── testCategoryApi.js      # Category API integration tests
│   ├── testOrderApi.js         # Order API integration tests
│   └── testSchoolApi.js        # School API integration tests
└── src/
    ├── app.js                  # Alternative entry (CJS, not actively used)
    ├── config/
    │   ├── index.js            # Centralized config (env vars, CORS, JWT, DB, uploads)
    │   └── dependencies.js     # DI container factory (Repository→Service→Controller)
    ├── db/
    │   └── index.js            # Supabase client init, query helpers, RPC helpers
    ├── middleware/
    │   ├── index.js            # setupMiddleware() — helmet, cors, compression, rate limit
    │   ├── authMiddleware.js   # authenticateToken, optionalAuth, requireRoles, requireOwnership
    │   ├── errorHandler.js     # AppError class, errorHandler, notFoundHandler, asyncHandler
    │   ├── rateLimiter.js      # createRateLimiter, createAuthRateLimiter
    │   ├── upload.js           # Multer config (10MB, images only, memory storage)
    │   └── validator.js        # Joi validate() middleware, preprocessBody (JSON from FormData), sanitizeMiddleware
    ├── models/
    │   └── schemas.js          # ALL Joi validation schemas (891 lines)
    ├── controllers/            # Request handling layer — 11 controllers
    │   ├── authController.js
    │   ├── brandController.js
    │   ├── categoryController.js
    │   ├── imageController.js
    │   ├── orderController.js
    │   ├── paymentController.js
    │   ├── pincodeController.js
    │   ├── productController.js
    │   ├── schoolController.js
    │   ├── userController.js
    │   └── warehouseController.js
    ├── services/               # Business logic layer — 9 services
    │   ├── authService.js
    │   ├── categoryService.js
    │   ├── emailService.js
    │   ├── imageService.js
    │   ├── orderService.js
    │   ├── productService.js
    │   ├── schoolService.js
    │   ├── userService.js
    │   └── warehouseService.js
    ├── repositories/           # Data access layer — 13 repositories
    │   ├── brandRepository.js
    │   ├── categoryRepository.js
    │   ├── orderEventRepository.js
    │   ├── orderQueryRepository.js
    │   ├── orderRepository.js
    │   ├── pincodeRepository.js
    │   ├── productImageRepository.js
    │   ├── productOptionRepository.js
    │   ├── productRepository.js
    │   ├── productVariantRepository.js
    │   ├── schoolRepository.js
    │   ├── userRepository.js
    │   └── warehouseRepository.js
    ├── routes/                 # Route definitions — 12 files
    │   ├── index.js            # Master router — mounts all modules under /api/v1
    │   ├── authRoutes.js
    │   ├── brandRoutes.js
    │   ├── categoryRoutes.js
    │   ├── imageRoutes.js
    │   ├── orderRoutes.js
    │   ├── paymentRoutes.js
    │   ├── pincodeRoutes.js
    │   ├── productRoutes.js
    │   ├── schoolRoutes.js
    │   ├── userRoutes.js
    │   └── warehouseRoutes.js
    └── utils/
        └── logger.js           # Winston logger, request logging middleware
```

---

## 3. Architecture Pattern

```
┌──────────────────────────────────────────────────────┐
│                     index.js                         │
│                  (Entry Point)                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  1. dotenv → env vars                         │  │
│  │  2. connectDB() → Supabase client             │  │
│  │  3. Instantiate Repos → Services → Controllers│  │
│  │  4. Create DI container                       │  │
│  │  5. setupRoutes(app, dependencies)            │  │
│  │  6. app.listen(PORT)                          │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │  Routes  │   │Middleware│   │  Config   │
   │ (Router  │   │  Chain   │   │+ DB Init  │
   │ factories│   │          │   │           │
   │  w/ DI)  │   │          │   │           │
   └────┬─────┘   └──────────┘   └──────────┘
        │
        ▼
   ┌──────────────┐
   │ Controllers  │  ← Handles HTTP req/res
   │              │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  Services    │  ← Business logic, validation, orchestration
   │              │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Repositories │  ← Data access via Supabase client
   │              │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  Supabase    │  ← PostgreSQL (hosted)
   │  Database    │
   └──────────────┘
```

### Dependency Injection Pattern
Routes are **factory functions** that receive a `dependencies` object containing controllers, services, and repositories. This enables testability and loose coupling.

```javascript
// Example: productRoutes(dependencies) receives { productController } from DI container
setupRoutes(app, {
  supabase, authController, userController, productController,
  schoolController, orderController, authService, userService,
  productService, schoolService, orderService, ...repositories
});
```

---

## 4. Middleware Pipeline

Every request flows through:

```
Request → Helmet → CORS → Rate Limiter → Body Parser → [Route-specific middleware] → Controller → Response
                                                             │
                                                    ┌────────┴────────┐
                                                    │  authenticateToken  │ ← JWT verification
                                                    │  requireRoles()     │ ← Role-based access
                                                    │  requireOwnership() │ ← Resource ownership
                                                    │  validate()         │ ← Joi schema validation
                                                    │  upload.single()    │ ← File upload (Multer)
                                                    └─────────────────────┘
```

### Auth Middleware Details

| Middleware | Purpose |
|---|---|
| [authenticateToken](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#4-60) | Extracts Bearer token, verifies via `authService.verifyToken()`, adds `req.user` |
| [optionalAuth](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#61-90) | Same as above but doesn't block if no token |
| [requireRoles(...roles)](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#91-126) | Checks `req.user.roles` array against required roles |
| [requireOwnership(paramName)](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#127-161) | Ensures user can only access their own resources |
| [requireVerification](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#162-184) | Blocks users with unverified emails |
| [requireActiveUser](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#185-207) | Blocks deactivated accounts |

### Validation Middleware
- Uses **Joi** schemas from [models/schemas.js](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/models/schemas.js)
- [validate(schema, property)](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) — validates `req.body`, `req.query`, or `req.params`
- Auto-preprocesses JSON strings from FormData submissions
- Strips unknown fields, converts types, reports all errors

---

## 5. Complete Route Map

All routes are mounted under **`/api/v1`**.

### 5.1 Auth Routes — `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | ❌ | Register new user (email, password, fullName) |
| POST | `/login` | ❌ | Login with email/password (supports `loginAs: customer/retailer/admin`) |
| POST | `/refresh-token` | ❌ | Refresh JWT token |
| POST | `/forgot-password` | ❌ | Request password reset email |
| POST | `/reset-password` | ❌ | Reset password with token |
| POST | `/google-login` | ❌ | Google OAuth login (idToken from client) |
| POST | `/verify-token` | ❌ | Verify if a JWT token is valid |
| GET | `/me` | ✅ | Get current user's profile |
| POST | `/logout` | ✅ | Logout (invalidate session) |

> **Legacy routes** also exist at root level: `POST /login`, `POST /register` (direct Supabase auth)

---

### 5.2 User Routes — `/api/v1/users`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/verify-email/confirm` | ❌ | — | Confirm email verification |
| GET | `/profile` | ✅ | Any | Get own profile |
| PUT | `/profile` | ✅ | Any | Update own profile |
| GET | `/addresses` | ✅ | Any | List saved addresses |
| POST | `/addresses` | ✅ | Any | Add new address |
| PUT | `/addresses/:addressId` | ✅ | Any | Update address |
| DELETE | `/addresses/:addressId` | ✅ | Any | Delete address |
| GET | `/preferences` | ✅ | Any | Get user preferences |
| PUT | `/preferences` | ✅ | Any | Update preferences |
| GET | `/stats` | ✅ | Any | Get user statistics |
| DELETE | `/account` | ✅ | Any | Deactivate own account |
| POST | `/verify-email` | ✅ | Any | Send verification email |
| POST | `/verify-phone` | ✅ | Any | Verify phone number |
| **Admin Routes** | | | | |
| GET | `/admin/search` | ✅ | Admin | Search all users |
| GET | `/admin/export` | ✅ | Admin | Export user data |
| GET | `/admin/:userId` | ✅ | Admin | Get user by ID |
| PUT | `/admin/:userId` | ✅ | Admin | Update user (admin) |
| PUT | `/admin/:userId/role` | ✅ | Admin | Change user role |
| POST | `/admin/:userId/reactivate` | ✅ | Admin | Reactivate deactivated account |

---

### 5.3 Product Routes — `/api/v1/products`

**Public Routes (No Auth):**

| Method | Path | Description |
|---|---|---|
| GET | `/` | Search/list products (paginated, filtered) |
| GET | `/retailer-search` | Search products by retailer name |
| GET | `/featured` | Get featured products |
| GET | `/stats` | Get product statistics |
| GET | `/variants/search` | Search across all variants |
| GET | `/variants/:variantId` | Get variant by ID |
| GET | `/category/:categorySlug` | Get products by category slug |
| GET | `/brand/:brandId` | Get products by brand |
| GET | `/type/:productType` | Get products by type (bookset/uniform/stationary/general) |
| GET | `/school/:schoolId` | Get products for a school |
| GET | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Get product by ID |
| GET | `/:id/complete` | Get product with all details (images, brands, retailer) |
| GET | `/:id/analytics` | Get product analytics |
| GET | `/:id/availability` | Check stock availability |
| GET | `/:id/options` | Get product option attributes |
| GET | `/:id/variants` | Get all variants for a product |
| GET | `/:id/images` | Get product images |
| GET | `/variants/:variantId/images` | Get variant-specific images |
| GET | `/:id/brands` | Get brands associated with product |

**Protected Routes (Auth Required):**

| Method | Path | Description |
|---|---|---|
| GET | `/admin/search` | Admin product search (includes deleted/inactive) |
| POST | `/` | Create product |
| POST | `/comprehensive` | Create product with all related data atomically |
| PUT | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Update product |
| PUT | `/:id/comprehensive` | Update product with all related data atomically |
| DELETE | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Soft delete product |
| PATCH | `/:id/activate` | Re-activate product |
| PUT | `/bulk-update` | Bulk update multiple products |
| **Options** | | |
| POST | `/:id/options` | Add option attribute (e.g., "Size", "Color") |
| POST | `/options/:attributeId/values` | Add option value (e.g., "XL", "Red") |
| PUT | `/options/:attributeId` | Update option attribute |
| PUT | `/options/values/:valueId` | Update option value |
| DELETE | `/options/:attributeId` | Delete option attribute |
| DELETE | `/options/values/:valueId` | Delete option value |
| **Variants** | | |
| POST | `/:id/variants` | Create variant |
| PUT | `/variants/:variantId` | Update variant |
| DELETE | `/variants/:variantId` | Delete variant |
| PATCH | `/variants/:variantId/stock` | Update variant stock |
| PUT | `/variants/bulk-stock-update` | Bulk update stocks |
| **Images** | | |
| POST | `/:id/images` | Add image (file upload or URL) |
| POST | `/:id/images/bulk` | Add multiple images |
| PUT | `/images/:imageId` | Update image |
| DELETE | `/images/:imageId` | Delete image |
| PATCH | `/:id/images/:imageId/primary` | Set primary image |
| POST | `/:id/variants/images/bulk` | Bulk upload variant images |
| **Brands** | | |
| POST | `/:id/brands` | Associate brand |
| DELETE | `/:id/brands/:brandId` | Remove brand association |
| **Retailer** | | |
| POST | `/:id/retailer` | Add retailer details |
| PUT | `/:id/retailer` | Update retailer details |
| DELETE | `/:id/retailer` | Remove retailer |

---

### 5.4 Category Routes — `/api/v1/categories`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | ❌ | Search/list categories (supports parentId, rootOnly) |
| GET | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | ❌ | Get category by ID |
| POST | `/` | ✅ | Create category (with image upload) |
| PUT | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | ✅ | Update category (with image upload) |
| DELETE | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | ✅ | Delete category |

Categories support **hierarchical structure** via `parentId` and `productAttributes` (array of attribute objects).

---

### 5.5 Brand Routes — `/api/v1/brands`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | ❌ | Search/list brands |
| GET | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | ❌ | Get brand by ID |
| POST | `/` | ✅ | Create brand |
| PUT | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | ✅ | Update brand |
| DELETE | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | ✅ | Delete brand |

---

### 5.6 School Routes — `/api/v1/schools`

**Public:**

| Method | Path | Description |
|---|---|---|
| GET | `/` | Search schools (city, state, type, board filters) |
| GET | `/stats` | School statistics |
| GET | `/popular` | Popular schools |
| GET | `/nearby` | Nearby schools (lat/lng/radius geolocation) |
| POST | `/validate` | Validate school data |
| GET | `/city/:city` | Schools by city |
| GET | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Get school by ID |
| GET | `/:id/analytics` | School analytics |
| GET | `/:id/catalog` | School product catalog |

**Protected:**

| Method | Path | Description |
|---|---|---|
| POST | `/` | Create school (with image upload) |
| PUT | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Update school (with image upload) |
| DELETE | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Deactivate school (soft delete) |
| PATCH | `/:id/reactivate` | Reactivate school |
| POST | `/bulk-import` | Bulk import from CSV |
| POST | `/upload-image` | Upload school image |
| POST | `/:schoolId/products/:productId` | Associate product with school (grade + mandatory) |
| PUT | `/:schoolId/products/:productId/:grade` | Update association |
| DELETE | `/:schoolId/products/:productId` | Remove association |
| POST | `/:id/partnerships` | Create school partnership |

---

### 5.7 Order Routes — `/api/v1/orders`

All order routes require authentication ([authenticateToken](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#4-60) applied globally).

**Customer Endpoints:**

| Method | Path | Description |
|---|---|---|
| POST | `/` | Place a new order |
| POST | `/place` | Place order (alias) |
| POST | `/calculate-summary` | Calculate order preview/summary for cart |
| GET | `/my-orders` | Get current user's orders |
| GET | `/:orderId` | Get order details |
| GET | `/:orderId/track` | Track order status/location |
| PUT | `/:orderId/cancel` | Cancel order |
| PUT | `/:orderId/items/:itemId/cancel` | Cancel specific item |
| POST | `/:orderId/queries` | Create support ticket |
| GET | `/:orderId/queries` | Get order support tickets |

**Admin/Retailer Endpoints:**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/admin/search` | admin, retailer | Search/filter all orders |
| GET | `/admin/status/:status` | admin, retailer | Orders by status |
| PUT | `/:orderId/status` | admin, retailer | Update order status |
| PUT | `/:orderId/items/:itemId/status` | admin, retailer | Update item status |
| PUT | `/:orderId/payment` | admin, system | Update payment status |
| PUT | `/admin/bulk-update` | admin | Bulk update orders |
| GET | `/admin/export` | admin | Export orders data |
| GET | `/admin/statistics` | admin, retailer | Order statistics/analytics |

**Order Status Flow:** `initialized → processed → shipped → out_for_delivery → delivered`  
**Cancellation:** `cancelled`, `refunded`  
**Payment Statuses:** `pending`, `paid`, `failed`, `refunded`

Rate limiting: 20 order creations per 15min, 60 queries per minute.

---

### 5.8 Payment Routes — `/api/v1/payments`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhook` | ❌ | Razorpay webhook (signature verified internally) |
| POST | `/create-order` | ✅ | Create Razorpay payment order |
| POST | `/verify` | ✅ | Verify Razorpay payment signature |
| POST | `/failure` | ✅ | Log payment failure |

---

### 5.9 Warehouse Routes — `/api/v1/warehouses`

All routes require auth. Role-based restrictions are prepared but commented out.

| Method | Path | Description |
|---|---|---|
| POST | `/` | Add warehouse (retailer) |
| POST | `/admin` | Add warehouse (admin) |
| GET | `/` | Get my warehouses |
| GET | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Get warehouse by ID |
| GET | `/retailer/:retailerId` | Get warehouses for retailer |
| PUT | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Update warehouse |
| PUT | `/admin/:id` | Update warehouse (admin) |
| DELETE | [/:id](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/validator.js#35-61) | Delete warehouse |
| DELETE | `/admin/:id` | Delete warehouse (admin) |

---

### 5.10 Pincode Routes — `/api/v1/pincodes`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check/:pincode` | ❌ | Check delivery availability for a pincode |

---

### 5.11 Image Routes — `/api/v1/images`

All routes require authentication.

| Method | Path | Description |
|---|---|---|
| POST | `/upload` | Upload image (file upload) |
| DELETE | `/delete` | Delete image |
| PUT | `/replace` | Replace existing image |

---

## 6. Validation Schemas (Joi)

Located in [src/models/schemas.js](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/models/schemas.js) (891 lines). Every entity has [create](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/app.js#8-52), `update`, and `query` schemas:

| Schema Group | Key Entities/Fields |
|---|---|
| `userSchemas` | register, login (with `loginAs`), googleAuth, updateProfile, forgotPassword, resetPassword, refreshToken |
| `brandSchemas` | name, slug, description, country, logoUrl, metadata |
| `categorySchemas` | name, slug, description, parentId, productAttributes (array of objects) |
| `productSchemas` | sku, title, description, productType (bookset/uniform/stationary/school/general), basePrice, currency (INR), city, categoryIds, brandIds, warehouseIds, metadata. AdminQuery adds `isDeleted` visibility |
| `productOptionSchemas` | Attribute: name, position (1-3), isRequired. Value: value, priceModifier, sortOrder |
| `productVariantSchemas` | sku, price, compareAtPrice, stock, weight, optionValue1/2/3, metadata |
| `productImageSchemas` | url, altText, sortOrder, isPrimary, variantId |
| `warehouseSchemas` | name, contactEmail/Phone, address (line1/2, city, state, postalCode), website |
| `schoolSchemas` | name, type (public/private/charter/international), board, address, city/state/country/postalCode, contact, productAssociation (grade + mandatory), partnership |
| `orderSchemas` | createOrder (items, shippingAddress, billingAddress, paymentMethod), calculateSummary, updateOrderStatus, cancelOrder, updatePaymentStatus, bulkUpdateOrders |
| `orderEventSchemas` | orderId, previousStatus, newStatus, changedBy, note, location (lat/lng) |
| `orderQuerySchemas` | Support tickets: subject, message, priority, category, attachments |
| `reviewSchemas` | productId, rating (1-5), title, body, images |
| `addressSchemas` | label, recipientName, phone, line1/2, city, state, postalCode, country, isDefault, lat/lng, landmark |
| `paramSchemas` | UUID validators for id, userId, productId, orderId, schoolId, categorySlug, brandId, variantId, attributeId, valueId, imageId, productType, city, grade |

---

## 7. Database Layer

### Supabase Client ([src/db/index.js](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/db/index.js))

| Function | Purpose |
|---|---|
| [connectDB()](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/db/index.js#32-59) | Initialize Supabase client, test connection |
| [getSupabase()](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/db/index.js#60-72) | Get singleton Supabase client (auto-init) |
| [createAuthenticatedClient(token)](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/db/index.js#73-105) | Create user-scoped client with JWT |
| [createServiceClient()](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/db/index.js#106-134) | Create service-role client (bypasses RLS) |
| [executeSupabaseQuery(table, op, options)](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/db/index.js#135-224) | Generic query helper (select/insert/update/delete) |
| [executeSupabaseRPC(fn, params)](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/db/index.js#225-251) | Call Supabase RPC (stored procedures) |

Uses **service role key** (bypasses RLS) for server-side operations. Repositories call the Supabase client directly using the `supabase-js` SDK.

---

## 8. Configuration

### Environment Variables (from [.env.example](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/.env.example))

```
PORT=3001
NODE_ENV=development
SUPABASE_URL=<supabase project url>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
JWT_SECRET=<secret>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
RAZORPAY_KEY_ID=<key>
RAZORPAY_KEY_SECRET=<secret>
```

### CORS Policy
- Allowed: `localhost:3000`, `localhost:5173`, `bukizz.in`, `192.168.1.33:3000`
- Auto-allows local network IPs (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`) for mobile testing

---

## 9. Authentication & Authorization Flow

```
Client → POST /api/v1/auth/login { email, password, loginAs }
       ↓
AuthService.login() → Supabase.auth.signInWithPassword()
       ↓
Returns { accessToken (JWT), refreshToken, user (with role) }
       ↓
Client → Subsequent requests with Header: Authorization: Bearer <accessToken>
       ↓
authenticateToken middleware → authService.verifyToken(token)
       ↓
req.user populated → { id, email, roles, ... }
       ↓
requireRoles('admin', 'retailer') → Checks req.user.roles array
```

### Role System
- **Roles available:** `customer`, `retailer`, `admin`, `system`
- Login schema accepts `loginAs` parameter to specify role context
- [requireRoles(...roles)](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/authMiddleware.js#91-126) middleware enforces role-based access
- Currently partially implemented — `req.user.roles` populated from user data

### Google OAuth Flow
1. Client gets `idToken` from Google Sign-In
2. `POST /api/v1/auth/google-login` with idToken
3. Server verifies via Supabase Auth and creates/links user

---

## 10. Error Handling

Centralized via [errorHandler](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/middleware/errorHandler.js#19-98) middleware (must be last):

```javascript
// Custom error class
throw new AppError("Product not found", 404);

// Global handler catches:
// - AppError (custom)
// - CastError (bad IDs)
// - Duplicate key (11000 / ER_DUP_ENTRY)
// - ValidationError
// - JWT errors (JsonWebTokenError, TokenExpiredError)
// - MySQL/Supabase errors

// Response format:
{
  "success": false,
  "error": "Error message",
  "correlationId": "req-xxx-yyy",  // for tracing
  "stack": "..."                    // dev only
}
```

---

## 11. Key Product Types & Business Entities

| Entity | Key Concept |
|---|---|
| **Product** | Types: `bookset`, `uniform`, `stationary`, [school](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/routes/schoolRoutes.js#7-266), `general`. Has base price, supports options (up to 3 attributes like Size/Color), variants (SKU + price + stock), images, brands, retailer info |
| **School** | Types: `public`, `private`, `charter`, `international`. Boards: `CBSE`, `ICSE`, `State Board`, `IB`, `IGCSE`. Products are associated per grade (`Pre-KG` to `12th`) |
| **Order** | Multi-item, supports shipping + billing addresses, payment methods ([cod](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/src/routes/pincodeRoutes.js#4-11), `upi`, `card`, `netbanking`, `wallet`). Full status lifecycle with event tracking |
| **Warehouse** | Retailer's warehouses with address and verification status. Products linked to warehouses |
| **Category** | Hierarchical (parent-child), has `productAttributes` for defining what attributes products in this category should have |
| **Brand** | Simple entity with name, slug, country, logo |

---

## 12. Logging

- **Winston** logger with file and console transports
- Error logs: [logs/error.log](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/logs/error.log) (5MB, 5 files rotation)
- Combined logs: [logs/combined.log](file:///d:/Projects/FullStack/Bukizz2/bukizz_node_server/logs/combined.log) (5MB, 5 files rotation)
- Request correlation IDs via `x-correlation-id` header or auto-generated
- Structured JSON logging in production, colorized simple format in development
