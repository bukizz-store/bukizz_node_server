# Bukizz Node Server — Complete Context Document

## 1. Project Overview

**Bukizz** is a **school e-commerce platform** API backend. It enables parents/students to purchase school supplies (books, uniforms, stationery) online, organized by school and grade. The platform supports three user roles: **Customer**, **Retailer**, and **Admin**.

| Attribute | Value |
|---|---|
| **Runtime** | Node.js ≥ 18 (ES Modules) |
| **Framework** | Express 4.18 |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | JWT (custom) + Supabase Auth (Google OAuth) + OTP (email-based) |
| **Payments** | Razorpay |
| **Validation** | Joi |
| **File Uploads** | Multer (memory storage → Supabase Storage) |
| **Logging** | Winston (file + console) |
| **Security** | Helmet, CORS, express-rate-limit, bcryptjs |
| **Email** | Nodemailer (OTP delivery, password resets) |
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
├── add_is_deleted_to_products.sql        # Migration: soft-delete for products
├── add_otp_columns_to_users.sql          # Migration: OTP fields on users table
├── add_product_attributes_to_categories.sql  # Migration: product_attributes JSONB on categories
├── create_otp_verifications_table.sql    # Migration: otp_verifications table
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
    │   ├── index.js            # Supabase client init, query helpers, RPC helpers
    │   ├── schema.sql          # Full DDL — all tables, types, indexes, triggers, RPC functions
    │   ├── init.sql            # Sample seed data for development/testing
    │   ├── sample_variant_data.sql
    │   ├── functions/
    │   │   └── create_comprehensive_product.sql  # RPC for atomic product creation
    │   ├── emergency_order_tables_migration.sql   # Create order_events & order_queries
    │   ├── migration_add_delivery_charge.sql      # Add delivery_charge to products
    │   ├── migration_add_highlight_to_products.sql # Add highlight column to products
    │   ├── migration_change_highlight_to_json.sql  # Change highlight TEXT → JSONB
    │   ├── migration_add_image_to_option_values.sql # Add image_url to product_option_values
    │   ├── migration_add_price_modifier.sql        # Add price_modifier to product_option_values
    │   ├── migration_create_retailer_schools.sql   # Create retailer_schools table
    │   ├── migration_fix_retailer_data_fkey.sql    # Fix retailer_data FK to public.users
    │   └── migration_rename_retailer_to_warehouse_in_order_items.sql  # Rename retailer_id → warehouse_id
    ├── middleware/
    │   ├── index.js            # setupMiddleware() — helmet, cors, compression, rate limit
    │   ├── authMiddleware.js   # authenticateToken, optionalAuth, requireRoles, requireOwnership
    │   ├── errorHandler.js     # AppError class, errorHandler, notFoundHandler, asyncHandler
    │   ├── rateLimiter.js      # createRateLimiter, createAuthRateLimiter
    │   ├── upload.js           # Multer config (10MB, images only, memory storage)
    │   └── validator.js        # Joi validate() middleware, preprocessBody, sanitizeMiddleware
    ├── models/
    │   └── schemas.js          # ALL Joi validation schemas (940 lines)
    ├── controllers/            # Request handling layer — 13 controllers
    │   ├── authController.js
    │   ├── brandController.js
    │   ├── categoryController.js
    │   ├── imageController.js
    │   ├── orderController.js
    │   ├── paymentController.js
    │   ├── pincodeController.js
    │   ├── productController.js
    │   ├── retailerController.js       # NEW — retailer onboarding & profile
    │   ├── retailerSchoolController.js # NEW — retailer-school linking
    │   ├── schoolController.js
    │   ├── userController.js
    │   └── warehouseController.js
    ├── services/               # Business logic layer — 11 services
    │   ├── authService.js      # Now includes OTP, retailer registration & verification
    │   ├── categoryService.js
    │   ├── emailService.js     # OTP email sending
    │   ├── imageService.js
    │   ├── orderService.js
    │   ├── productService.js
    │   ├── retailerService.js          # NEW — retailer profile management
    │   ├── retailerSchoolService.js    # NEW — retailer-school link management
    │   ├── schoolService.js
    │   ├── userService.js
    │   └── warehouseService.js
    ├── repositories/           # Data access layer — 16 repositories
    │   ├── brandRepository.js
    │   ├── categoryRepository.js
    │   ├── orderEventRepository.js
    │   ├── orderQueryRepository.js
    │   ├── orderRepository.js
    │   ├── otpRepository.js            # NEW — OTP CRUD operations
    │   ├── pincodeRepository.js
    │   ├── productImageRepository.js
    │   ├── productOptionRepository.js
    │   ├── productRepository.js
    │   ├── productVariantRepository.js
    │   ├── retailerRepository.js       # NEW — retailer_data CRUD
    │   ├── retailerSchoolRepository.js # NEW — retailer_schools CRUD
    │   ├── schoolRepository.js
    │   ├── userRepository.js
    │   └── warehouseRepository.js
    ├── routes/                 # Route definitions — 14 files
    │   ├── index.js            # Master router — mounts all modules under /api/v1
    │   ├── authRoutes.js
    │   ├── brandRoutes.js
    │   ├── categoryRoutes.js
    │   ├── imageRoutes.js
    │   ├── orderRoutes.js
    │   ├── paymentRoutes.js
    │   ├── pincodeRoutes.js
    │   ├── productRoutes.js
    │   ├── retailerRoutes.js           # NEW — /api/v1/retailer
    │   ├── retailerSchoolRoutes.js     # NEW — /api/v1/retailer-schools
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
Routes are **factory functions** that receive a `dependencies` object containing controllers, services, and repositories. Some newer modules (retailer, retailerSchool, warehouse, image) use **direct imports** instead of DI.

```javascript
// DI-based routes (authRoutes, userRoutes, productRoutes, schoolRoutes, orderRoutes, categoryRoutes, etc.)
app.use(`${apiV1}/auth`, authRoutes(dependencies));

// Direct-import routes (retailerRoutes, retailerSchoolRoutes, warehouseRoutes, imageRoutes)
app.use(`${apiV1}/retailer`, retailerRoutes);
app.use(`${apiV1}/retailer-schools`, retailerSchoolRoutes);
app.use(`${apiV1}/warehouses`, warehouseRoutes);
app.use(`${apiV1}/images`, imageRoutes);
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
| `authenticateToken` | Extracts Bearer token, verifies via `authService.verifyToken()`, adds `req.user` |
| `optionalAuth` | Same as above but doesn't block if no token |
| `requireRoles(...roles)` | Checks `req.user.roles` array against required roles |
| `requireOwnership(paramName)` | Ensures user can only access their own resources |
| `requireVerification` | Blocks users with unverified emails |
| `requireActiveUser` | Blocks deactivated accounts |

### Validation Middleware
- Uses **Joi** schemas from `src/models/schemas.js` (940 lines)
- `validate(schema, property)` — validates `req.body`, `req.query`, `req.params`, or `req.headers`
- Auto-preprocesses JSON strings from FormData submissions
- Strips unknown fields, converts types, reports all errors

---

## 5. Complete Route Map

All routes are mounted under **`/api/v1`**.

### 5.1 Auth Routes — `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | ❌ | Register new customer (email, password, fullName) |
| POST | `/login` | ❌ | Login with email/password (supports `loginAs: customer/retailer/admin`) |
| POST | `/login-retailer` | ❌ | Login specifically as retailer (email, password) |
| POST | `/register-retailer` | ❌ | Register new retailer (fullName, email, password, phone) — account created as inactive/unauthorized |
| POST | `/send-otp` | ❌ | Send OTP to email for customer registration |
| POST | `/verify-otp` | ❌ | Verify OTP and complete customer registration |
| POST | `/send-retailer-otp` | ❌ | Send OTP for retailer registration (email, fullName, password, phone) |
| POST | `/verify-retailer-otp` | ❌ | Verify retailer OTP, create inactive retailer account |
| POST | `/refresh-token` | ❌ | Refresh JWT token |
| POST | `/forgot-password` | ❌ | Request password reset email |
| POST | `/reset-password` | ❌ | Reset password with token |
| POST | `/google-login` | ❌ | Google OAuth login (Supabase Auth token from client) |
| POST | `/verify-token` | ❌ | Verify if a JWT token is valid |
| PUT | `/verify-retailer` | ✅ | Admin action: authorize/deauthorize a retailer (body: `{retailerId, action}`) |
| GET | `/me` | ✅ | Get current user's profile |
| POST | `/logout` | ✅ | Logout (revoke refresh tokens) |

#### OTP Registration Flow (Customer)
1. `POST /send-otp` → sends 6-digit OTP to email, stores hashed password + fullName in `otp_verifications` table
2. `POST /verify-otp` → verifies OTP (10 min expiry), creates user + user_auth records, returns tokens

#### OTP Registration Flow (Retailer)
1. `POST /send-retailer-otp` → sends 6-digit OTP, stores metadata (fullName, passwordHash, phone, role)
2. `POST /verify-retailer-otp` → verifies OTP, creates user with `is_active=false`, `role='retailer'`, `deactivation_reason='unauthorized'`, returns tokens for onboarding access
3. Admin uses `PUT /verify-retailer` with `{retailerId, action: 'authorize'}` to activate

#### Retailer Authorization States
| is_active | deactivation_reason | Status |
|---|---|---|
| `false` | `unauthorized` | Pending admin approval |
| `true` | `authorized` | Verified and active |
| `false` | other | Deactivated |

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
| GET | `/:id` | Get product by ID |
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
| GET | `/warehouse` | Get products for a warehouse (Retailer Dashboard). Requires `x-warehouse-id` header |
| GET | `/admin/search` | Admin product search (includes deleted/inactive) |
| POST | `/` | Create product |
| POST | `/comprehensive` | Create product with all related data atomically (via RPC) |
| PUT | `/:id` | Update product |
| PUT | `/:id/comprehensive` | Update product with all related data atomically |
| DELETE | `/:id` | Soft delete product (`is_deleted = true`) |
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
| GET | `/:id` | ❌ | Get category by ID |
| POST | `/` | ✅ | Create category (with image upload) |
| PUT | `/:id` | ✅ | Update category (with image upload) |
| DELETE | `/:id` | ✅ | Delete category |

Categories support **hierarchical structure** via `parentId` and `productAttributes` (JSONB — array of attribute objects defining what attributes products in this category should have).

---

### 5.5 Brand Routes — `/api/v1/brands`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | ❌ | Search/list brands |
| GET | `/:id` | ❌ | Get brand by ID |
| POST | `/` | ✅ | Create brand |
| PUT | `/:id` | ✅ | Update brand |
| DELETE | `/:id` | ✅ | Delete brand |

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
| GET | `/:id` | Get school by ID |
| GET | `/:id/analytics` | School analytics |
| GET | `/:id/catalog` | School product catalog |

**Protected:**

| Method | Path | Description |
|---|---|---|
| POST | `/` | Create school (with image upload) |
| PUT | `/:id` | Update school (with image upload) |
| DELETE | `/:id` | Deactivate school (soft delete) |
| PATCH | `/:id/reactivate` | Reactivate school |
| POST | `/bulk-import` | Bulk import from CSV |
| POST | `/upload-image` | Upload school image |
| POST | `/:schoolId/products/:productId` | Associate product with school (grade + mandatory) |
| PUT | `/:schoolId/products/:productId/:grade` | Update association |
| DELETE | `/:schoolId/products/:productId` | Remove association |
| POST | `/:id/partnerships` | Create school partnership |

---

### 5.7 Order Routes — `/api/v1/orders`

All order routes require authentication (`authenticateToken` applied globally).

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

All routes require auth. Role-based restrictions are enforced in controllers.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | retailer, admin | Add warehouse |
| POST | `/admin` | admin | Add warehouse for a retailer (body includes `retailerId`) |
| GET | `/` | retailer, admin | Get my warehouses (by authenticated user ID) |
| GET | `/:id` | retailer, admin | Get warehouse by ID |
| GET | `/retailer/:retailerId` | admin | Get warehouses for a specific retailer |
| PUT | `/:id` | retailer | Update own warehouse |
| PUT | `/admin/:id` | admin | Update any warehouse (admin) |
| DELETE | `/:id` | retailer | Delete own warehouse |
| DELETE | `/admin/:id` | admin | Delete any warehouse (admin) |

---

### 5.10 Retailer Routes — `/api/v1/retailer` (NEW)

Routes for retailer profile management and onboarding.

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/data` | ✅ | retailer | Create/update retailer profile with signature upload (displayName, ownerName, gstin, pan, signature file) |
| GET | `/data` | ✅ | Any | Get retailer profile |
| GET | `/data/status` | ✅ | Any | Check if retailer profile is complete (returns missing fields list) |
| GET | `/verification-status` | ✅ | Any | Check retailer verification/authorization status |

#### Retailer Onboarding Flow
1. Retailer registers via `/auth/send-retailer-otp` → `/auth/verify-retailer-otp`
2. Account created as `is_active=false`, `deactivation_reason='unauthorized'`
3. Retailer submits profile data via `POST /retailer/data` (displayName, ownerName, GSTIN, PAN, signature image)
4. Admin authorizes via `PUT /auth/verify-retailer` → sets `is_active=true`, `deactivation_reason='authorized'`

---

### 5.11 Retailer-School Routes — `/api/v1/retailer-schools` (NEW)

All routes require authentication. Manages the many-to-many relationship between retailers and schools.

| Method | Path | Description |
|---|---|---|
| POST | `/link` | Link a retailer to a school (body: `{schoolId, retailerId?, status?, productType?}`) |
| GET | `/connected-schools` | Get all schools connected to authenticated retailer |
| GET | `/connected-schools/:retailerId` | Get all schools connected to a specific retailer |
| GET | `/connected-retailers/:schoolId` | Get all retailers connected to a school |
| PATCH | `/status` | Update link status (body: `{retailerId?, schoolId, currentStatus, newStatus}`) |
| PATCH | `/product-type` | Update product types for a link (body: `{retailerId?, schoolId, status, productType}`) |
| DELETE | `/` | Remove a retailer-school link (body: `{retailerId?, schoolId, status}`) |

**Link Statuses:** `approved`, `pending`, `rejected`

> Note: Status is part of the composite primary key `(retailer_id, school_id, status)`, so status updates require delete + re-insert.

---

### 5.12 Pincode Routes — `/api/v1/pincodes`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check/:pincode` | ❌ | Check delivery availability for a pincode |

---

### 5.13 Image Routes — `/api/v1/images`

All routes require authentication.

| Method | Path | Description |
|---|---|---|
| POST | `/upload` | Upload image (file upload) |
| DELETE | `/delete` | Delete image |
| PUT | `/replace` | Replace existing image |

---

## 6. Database Schema

### 6.1 Custom Types (ENUMs)

```sql
CREATE TYPE order_status AS ENUM ('initialized', 'processed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE product_type AS ENUM ('bookset', 'uniform', 'stationary', 'general');
CREATE TYPE auth_provider AS ENUM ('email', 'google');
CREATE TYPE query_status AS ENUM ('open', 'pending', 'resolved', 'closed');
```

> Note: The Joi schemas also accept `'school'` as a product type (used in app logic), but the DB ENUM only has 4 values.

### 6.2 Tables

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Default `uuid_generate_v4()` |
| full_name | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | NOT NULL UNIQUE |
| email_verified | BOOLEAN | Default FALSE |
| phone | VARCHAR(50) | |
| phone_verified | BOOLEAN | Default FALSE |
| date_of_birth | DATE | |
| gender | VARCHAR(20) | |
| city | VARCHAR(100) | |
| state | VARCHAR(100) | |
| role | VARCHAR(50) | Default `'customer'`. Values: `customer`, `retailer`, `admin` |
| school_id | UUID FK→schools | ON DELETE SET NULL |
| is_active | BOOLEAN | Default TRUE. Retailers start as FALSE |
| last_login_at | TIMESTAMPTZ | |
| deactivated_at | TIMESTAMPTZ | |
| deactivation_reason | TEXT | For retailers: `'unauthorized'` (pending) / `'authorized'` (verified) |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | NOT NULL, Default NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, Default NOW() (auto-updated via trigger) |
| otp | VARCHAR(6) | (Added via migration — legacy, replaced by otp_verifications table) |
| otp_created_at | TIMESTAMPTZ | (Added via migration — legacy) |
| is_verified | BOOLEAN | Default FALSE (Added via migration — legacy) |

#### `user_auths`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | ON DELETE CASCADE |
| provider | auth_provider ENUM | `'email'` or `'google'` |
| provider_user_id | VARCHAR(255) | NOT NULL |
| password_hash | VARCHAR(512) | NULL for Google auth |
| provider_data | JSONB | |
| created_at | TIMESTAMPTZ | |
| UNIQUE | (provider, provider_user_id) | |

#### `refresh_tokens`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | ON DELETE CASCADE |
| token_hash | VARCHAR(512) | SHA-256 hash of refresh token |
| device_info | VARCHAR(255) | |
| expires_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | NULL = active |

#### `password_resets`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | ON DELETE CASCADE |
| token_hash | VARCHAR(512) | |
| expires_at | TIMESTAMPTZ | 1 hour expiry |
| created_at | TIMESTAMPTZ | |
| used_at | TIMESTAMPTZ | NULL = unused |

#### `otp_verifications` (NEW)
| Column | Type | Notes |
|---|---|---|
| email | TEXT PK | Primary key — one OTP per email |
| otp | TEXT | 6-digit OTP code |
| created_at | TIMESTAMPTZ | Default NOW(). OTP expires after 10 minutes (app logic) |
| metadata | JSONB | Stores `{fullName, passwordHash, phone?, role?}` for registration |

#### `addresses`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | ON DELETE CASCADE |
| label | VARCHAR(50) | e.g., "Home", "Work" |
| recipient_name | VARCHAR(255) | |
| phone | VARCHAR(50) | |
| line1, line2 | VARCHAR(255) | |
| city, state | VARCHAR(100) | |
| postal_code | VARCHAR(30) | |
| country | VARCHAR(100) | |
| is_default | BOOLEAN | Default FALSE |
| lat, lng | DOUBLE PRECISION | Geolocation |
| is_active | BOOLEAN | Default TRUE |
| created_at | TIMESTAMPTZ | |

#### `schools`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | NOT NULL |
| board | VARCHAR(100) | CBSE, ICSE, State Board, IB, IGCSE |
| address | JSONB | `{line1, line2}` |
| city | VARCHAR(100) | |
| state | VARCHAR(100) | |
| postal_code | VARCHAR(30) | |
| contact | JSONB | `{phone, email, website}` |
| is_active | BOOLEAN | Default TRUE |
| created_at | TIMESTAMPTZ | |

#### `retailers` (Legacy)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | NOT NULL |
| contact_email | VARCHAR(255) | |
| contact_phone | VARCHAR(50) | |
| address | JSONB | |
| website | VARCHAR(255) | |
| is_verified | BOOLEAN | Default FALSE |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |

> Note: The `retailers` table is the **legacy** retailer entity. Modern retailer data is stored in the `retailer_data` table keyed by `user_id` from the `users` table (where `role='retailer'`).

#### `retailer_data` (NEW — used by RetailerRepository)
| Column | Type | Notes |
|---|---|---|
| retailer_id | UUID PK/FK→users | ON DELETE CASCADE |
| display_name | TEXT | Business display name |
| owner_name | TEXT | Owner's name |
| gstin | TEXT | GST Identification Number |
| pan | TEXT | PAN card number |
| signature_url | TEXT | URL to uploaded signature image |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `retailer_schools` (NEW)
| Column | Type | Notes |
|---|---|---|
| retailer_id | UUID FK→users | ON DELETE CASCADE |
| school_id | UUID FK→schools | ON DELETE CASCADE |
| status | VARCHAR(20) | `'approved'`, `'pending'`, `'rejected'`. CHECK constraint. |
| product_type | JSONB | Default `'[]'::jsonb`. Array of product types the retailer sells for this school |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| **PRIMARY KEY** | (retailer_id, school_id, status) | Composite — allows same retailer+school with different statuses |

#### `categories`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(255) | NOT NULL UNIQUE |
| description | TEXT | |
| parent_id | UUID FK→categories | Self-referencing, ON DELETE SET NULL |
| is_active | BOOLEAN | Default TRUE |
| product_attributes | JSONB | Default `'{}'::jsonb`. Category-level product attribute definitions (Added via migration) |
| created_at | TIMESTAMPTZ | |

#### `brands`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(255) | NOT NULL UNIQUE |
| description | TEXT | |
| country | VARCHAR(100) | |
| logo_url | TEXT | |
| metadata | JSONB | |
| is_active | BOOLEAN | Default TRUE |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | (auto-updated via trigger) |

#### `products`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| sku | VARCHAR(100) | UNIQUE |
| title | VARCHAR(255) | NOT NULL |
| short_description | VARCHAR(512) | |
| description | TEXT | |
| product_type | product_type ENUM | Default `'general'` |
| base_price | DECIMAL(12,2) | NOT NULL, Default 0 |
| stock | INTEGER | Default 0, CHECK ≥ 0 |
| min_order_quantity | INTEGER | Default 1 |
| max_order_quantity | INTEGER | Default 1000 |
| weight | DECIMAL(10,3) | |
| dimensions | JSONB | |
| image_url | TEXT | |
| currency | CHAR(3) | Default `'INR'` |
| retailer_id | UUID FK→retailers | ON DELETE SET NULL (legacy) |
| is_active | BOOLEAN | Default TRUE |
| is_deleted | BOOLEAN | Default FALSE (Added via migration — soft delete) |
| highlight | JSONB | Default `'[]'::jsonb`. Array of highlight strings (Added as TEXT, migrated to JSONB) |
| delivery_charge | DECIMAL(10,2) | Default 0. Per-unit delivery charge (Added via migration) |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | (auto-updated via trigger) |

#### `product_categories` (Junction)
| Column | Type |
|---|---|
| product_id | UUID FK→products (CASCADE) |
| category_id | UUID FK→categories (CASCADE) |
| **PK** | (product_id, category_id) |

#### `product_brands` (Junction)
| Column | Type |
|---|---|
| product_id | UUID FK→products (CASCADE) |
| brand_id | UUID FK→brands (CASCADE) |
| **PK** | (product_id, brand_id) |

#### `product_schools` (Junction)
| Column | Type | Notes |
|---|---|---|
| product_id | UUID FK→products (CASCADE) | |
| school_id | UUID FK→schools (CASCADE) | |
| grade | VARCHAR(50) | Pre-KG through 12th |
| mandatory | BOOLEAN | Default FALSE |
| **PK** | (product_id, school_id, grade) | |

#### `product_option_attributes`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK→products (CASCADE) | |
| name | VARCHAR(100) | e.g., "Size", "Color", "Binding" |
| position | INTEGER | CHECK 1–3. UNIQUE per product |
| is_required | BOOLEAN | Default TRUE |
| created_at | TIMESTAMPTZ | |

#### `product_option_values`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| attribute_id | UUID FK→product_option_attributes (CASCADE) | |
| value | VARCHAR(255) | e.g., "XL", "Red", "Hardcover" |
| sort_order | INTEGER | Default 0 |
| price_modifier | DECIMAL(10,2) | Default 0.00, CHECK ≥ 0. Extra charge for this option (Added via migration) |
| image_url | TEXT | Option value image — e.g., color swatch (Added via migration) |
| created_at | TIMESTAMPTZ | |

#### `product_variants`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK→products (CASCADE) | |
| sku | VARCHAR(150) | UNIQUE |
| price | DECIMAL(12,2) | |
| compare_at_price | DECIMAL(12,2) | Strikethrough/original price |
| stock | INTEGER | Default 0, CHECK ≥ 0 |
| weight | DECIMAL(10,3) | |
| option_value_1 | UUID FK→product_option_values | ON DELETE SET NULL |
| option_value_2 | UUID FK→product_option_values | ON DELETE SET NULL |
| option_value_3 | UUID FK→product_option_values | ON DELETE SET NULL |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | (auto-updated via trigger) |

#### `product_images`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK→products (CASCADE) | |
| variant_id | UUID FK→product_variants (CASCADE) | Optional — variant-specific images |
| url | TEXT | NOT NULL |
| alt_text | VARCHAR(255) | |
| sort_order | INTEGER | Default 0 |
| is_primary | BOOLEAN | Default FALSE |
| created_at | TIMESTAMPTZ | |

#### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_number | VARCHAR(100) | NOT NULL UNIQUE |
| user_id | UUID FK→users | ON DELETE SET NULL |
| status | order_status ENUM | Default `'initialized'` |
| total_amount | DECIMAL(12,2) | NOT NULL, Default 0 |
| currency | CHAR(3) | Default `'INR'` |
| shipping_address | JSONB | |
| billing_address | JSONB | |
| contact_phone | VARCHAR(50) | |
| contact_email | VARCHAR(255) | |
| payment_method | VARCHAR(100) | cod, upi, card, netbanking, wallet |
| payment_status | VARCHAR(50) | |
| warehouse_id | UUID FK→warehouse | ON DELETE SET NULL (Renamed from `retailer_id` via migration) |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | (auto-updated via trigger) |

#### `order_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK→orders (CASCADE) | |
| product_id | UUID FK→products | ON DELETE SET NULL |
| variant_id | UUID FK→product_variants | ON DELETE SET NULL |
| sku | VARCHAR(150) | Snapshot at time of order |
| title | VARCHAR(255) | Snapshot at time of order |
| quantity | INTEGER | NOT NULL, Default 1 |
| unit_price | DECIMAL(12,2) | NOT NULL, Default 0 |
| total_price | DECIMAL(12,2) | NOT NULL, Default 0 |
| product_snapshot | JSONB | Full product data frozen at order time |
| warehouse_id | UUID FK→warehouse | ON DELETE SET NULL (Renamed from `retailer_id` via migration) |
| created_at | TIMESTAMPTZ | |

#### `order_events`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK→orders (CASCADE) | |
| previous_status | order_status ENUM | |
| new_status | order_status ENUM | NOT NULL |
| changed_by | UUID FK→users | ON DELETE SET NULL |
| note | TEXT | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |

#### `order_queries`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK→orders (CASCADE) | |
| user_id | UUID FK→users (CASCADE) | |
| subject | VARCHAR(255) | NOT NULL |
| message | TEXT | NOT NULL |
| priority | VARCHAR(20) | Default `'normal'` |
| status | query_status ENUM | Default `'open'` |
| attachments | JSONB | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | (auto-updated via trigger) |

### 6.3 Database Functions (RPC)

| Function | Purpose |
|---|---|
| `update_updated_at_column()` | Trigger function — auto-updates `updated_at` on row update |
| `increment_variant_stock(variant_id, quantity)` | Atomically increment variant stock |
| `decrement_variant_stock(variant_id, quantity)` | Atomically decrement variant stock (min 0) |
| `create_comprehensive_product(payload JSONB)` | Atomic RPC for creating a product with all related data (categories, schools, brands, warehouses, options, values with image_url + price_modifier, variants with option name resolution, images) in a single transaction |

### 6.4 Migration Summary

| Migration File | Changes |
|---|---|
| `add_is_deleted_to_products.sql` | Added `is_deleted BOOLEAN DEFAULT FALSE` to `products` |
| `add_otp_columns_to_users.sql` | Added `otp`, `otp_created_at`, `is_verified` to `users` (legacy — now uses `otp_verifications` table) |
| `create_otp_verifications_table.sql` | Created `otp_verifications` table (email PK, otp, metadata JSONB) |
| `add_product_attributes_to_categories.sql` | Added `product_attributes JSONB` to `categories` |
| `migration_add_delivery_charge.sql` | Added `delivery_charge DECIMAL(10,2) DEFAULT 0` to `products` |
| `migration_add_highlight_to_products.sql` | Added `highlight TEXT` to `products` |
| `migration_change_highlight_to_json.sql` | Changed `highlight` from `TEXT` to `JSONB DEFAULT '[]'::jsonb` |
| `migration_add_image_to_option_values.sql` | Added `image_url TEXT` to `product_option_values` |
| `migration_add_price_modifier.sql` | Added `price_modifier DECIMAL(10,2) DEFAULT 0.00 CHECK >= 0` to `product_option_values` |
| `migration_create_retailer_schools.sql` | Created `retailer_schools` table with composite PK `(retailer_id, school_id, status)` |
| `migration_fix_retailer_data_fkey.sql` | Fixed `retailer_data.retailer_id` FK to point to `public.users` instead of `auth.users` |
| `migration_rename_retailer_to_warehouse_in_order_items.sql` | Renamed `retailer_id → warehouse_id` in both `orders` and `order_items` tables, updated FK to reference `warehouse` table |
| `emergency_order_tables_migration.sql` | Created `order_events` and `order_queries` tables with indexes and triggers |

---

## 7. Validation Schemas (Joi)

Located in `src/models/schemas.js` (940 lines). Every entity has create, update, and query schemas:

| Schema Group | Key Entities/Fields |
|---|---|
| `userSchemas` | register, login (with `loginAs`), retailerLogin, retailerRegister, sendRetailerOtp, verifyRetailerOtp, verifyRetailer (retailerId + action: authorize/deauthorize), googleAuth, updateProfile, forgotPassword, resetPassword, refreshToken |
| `brandSchemas` | name, slug, description, country, logoUrl, metadata |
| `categorySchemas` | name, slug, description, parentId, productAttributes (JSONB) |
| `productSchemas` | create, update, query, adminQuery (with `isDeleted` visibility), warehouseProductQuery (page, limit, search, categoryId, status). Fields: sku, title, description, productType (bookset/uniform/stationary/school/general), basePrice, currency (INR), city, categoryIds, brandIds, warehouseIds, metadata |
| `productOptionSchemas` | Attribute: name, position (1-3), isRequired. Value: value, priceModifier, sortOrder, imageUrl |
| `productVariantSchemas` | sku, price, compareAtPrice, stock, weight, optionValue1/2/3, metadata |
| `productImageSchemas` | url, altText, sortOrder, isPrimary, variantId |
| `warehouseSchemas` | name, contactEmail/Phone, address (line1/2, city, state, postalCode, country), website, metadata |
| `schoolSchemas` | name, image, type (public/private/charter/international/other), board, address (line1/2), city, state, country, postalCode, contact, phone, email, productAssociation (grade + mandatory), partnership |
| `orderSchemas` | createOrder (items, shippingAddress, billingAddress, paymentMethod), calculateSummary, updateOrderStatus, cancelOrder, updatePaymentStatus, bulkUpdateOrders |
| `orderEventSchemas` | orderId, previousStatus, newStatus, changedBy, note, location (lat/lng) |
| `orderQuerySchemas` | Support tickets: subject, message, priority, category, attachments |
| `reviewSchemas` | productId, rating (1-5), title, body, images |
| `addressSchemas` | label, recipientName, phone, line1/2, city, state, postalCode, country, isDefault, lat/lng, landmark |
| `headerSchemas` | warehouseHeaders: `x-warehouse-id` (UUID, required) |
| `paramSchemas` | UUID validators for id, userId, productId, orderId, schoolId, warehouseId, categorySlug, categoryId, brandId, variantId, attributeId, valueId, imageId, productType, city, grade. Combined: idAndBrandId, idAndImageId |

---

## 8. Database Layer

### Supabase Client (`src/db/index.js`)

| Function | Purpose |
|---|---|
| `connectDB()` | Initialize Supabase client, test connection |
| `getSupabase()` | Get singleton Supabase client (auto-init) |
| `getDB()` | Alias used by DI container |
| `createAuthenticatedClient(token)` | Create user-scoped client with JWT |
| `createServiceClient()` | Create service-role client (bypasses RLS) |
| `executeSupabaseQuery(table, op, options)` | Generic query helper (select/insert/update/delete) |
| `executeSupabaseRPC(fn, params)` | Call Supabase RPC (stored procedures) |

Uses **service role key** (bypasses RLS) for server-side operations. Repositories call the Supabase client directly using the `supabase-js` SDK.

---

## 9. Configuration

### Environment Variables

```
PORT=3001
NODE_ENV=development
SUPABASE_URL=<supabase project url>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
JWT_SECRET=<secret>
JWT_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=7d
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

## 10. Authentication & Authorization Flow

### Standard Login Flow
```
Client → POST /api/v1/auth/login { email, password, loginAs }
       ↓
AuthService.login() → verify password via bcrypt
       ↓
Role check: loginAs must match user.role
       ↓
Retailer check: if retailer, verify is_active + deactivation_reason
       ↓
Returns { accessToken (JWT), refreshToken, user (with role) }
       ↓
Client → Subsequent requests with Header: Authorization: Bearer <accessToken>
       ↓
authenticateToken middleware → authService.verifyToken(token)
       ↓
req.user populated → { id, email, role, roles[], is_active, deactivation_reason, ... }
       ↓
requireRoles('admin', 'retailer') → Checks req.user.roles array
```

### OTP Registration Flow
```
Client → POST /api/v1/auth/send-otp { email, fullName, password }
       ↓
AuthService.sendOtp() → Generate 6-digit OTP → Store in otp_verifications → Send via email
       ↓
Client → POST /api/v1/auth/verify-otp { email, otp }
       ↓
AuthService.verifyOtp() → Validate OTP (10 min expiry) → Create user + user_auth → Generate tokens
       ↓
Returns { accessToken, refreshToken, user }
```

### Retailer Registration Flow
```
Client → POST /api/v1/auth/send-retailer-otp { email, fullName, password, phone }
       ↓
AuthService.sendRetailerOtp() → Store metadata with role='retailer' in otp_verifications
       ↓
Client → POST /api/v1/auth/verify-retailer-otp { email, otp }
       ↓
AuthService.verifyRetailerOtp() → Create user (is_active=false, role='retailer', deactivation_reason='unauthorized')
       ↓
Returns tokens (for onboarding access) + user
       ↓
Client → POST /api/v1/retailer/data { displayName, ownerName, gstin, pan, signature (file) }
       ↓
Admin → PUT /api/v1/auth/verify-retailer { retailerId, action: 'authorize' }
       ↓
User updated: is_active=true, deactivation_reason='authorized'
```

### Retailer Login Flow
```
Client → POST /api/v1/auth/login-retailer { email, password }
       ↓
AuthService.loginRetailer() → verify password, check role === 'retailer'
       ↓
Returns tokens (even if is_active=false — allows onboarding access)
       ↓
Token verification: verifyToken() allows inactive retailers through
```

### Role System
- **Roles available:** `customer`, `retailer`, `admin`, `system`
- Login schema accepts `loginAs` parameter to specify role context
- `requireRoles(...roles)` middleware enforces role-based access
- `req.user.roles` array is populated from `user.role` field

### Google OAuth Flow
1. Client gets token from Google Sign-In via Supabase Auth
2. `POST /api/v1/auth/google-login` with Supabase auth token
3. Server verifies via `supabase.auth.getUser(token)`
4. Creates or links user, sets `email_verified=true`
5. Returns JWT tokens

---

## 11. Error Handling

Centralized via `errorHandler` middleware (must be last):

```javascript
// Custom error class
throw new AppError("Product not found", 404);

// asyncHandler wrapper for async controller methods
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Global handler catches:
// - AppError (custom, with statusCode)
// - CastError (bad IDs)
// - Duplicate key (11000 / ER_DUP_ENTRY)
// - ValidationError
// - JWT errors (JsonWebTokenError, TokenExpiredError)
// - Supabase errors

// Response format:
{
  "success": false,
  "error": "Error message",
  "correlationId": "req-xxx-yyy",  // for tracing
  "stack": "..."                    // dev only
}
```

---

## 12. Key Business Entities

| Entity | Key Concept |
|---|---|
| **Product** | Types: `bookset`, `uniform`, `stationary`, `school`, `general`. Has base price, delivery_charge, highlight (JSONB array), supports options (up to 3 attributes like Size/Color with price_modifier and image_url per value), variants (SKU + price + stock), images, brands, retailer info. Soft-deletable via `is_deleted`. |
| **School** | Types: `public`, `private`, `charter`, `international`, `other`. Boards: `CBSE`, `ICSE`, `State Board`, `IB`, `IGCSE`, `Other`. Products associated per grade (`Pre-KG` to `12th`). |
| **Order** | Multi-item, supports shipping + billing addresses, payment methods (cod, upi, card, netbanking, wallet). Full status lifecycle with event tracking. Items tracked per warehouse (`warehouse_id`). |
| **Warehouse** | Retailer's warehouses with address and verification status. Products linked to warehouses via `products_warehouse` junction. Orders track fulfillment warehouse via `warehouse_id` (migrated from `retailer_id`). |
| **Retailer** | Two data models: legacy `retailers` table, and modern `retailer_data` table (keyed by user_id). Onboarding requires GSTIN, PAN, signature. Verification managed via `users.is_active` + `users.deactivation_reason`. |
| **Retailer-School Link** | Many-to-many via `retailer_schools` table. Composite PK (retailer_id, school_id, status). Tracks which retailers serve which schools and for what product types. |
| **Category** | Hierarchical (parent-child), has `productAttributes` JSONB for defining what attributes products in this category should have. |
| **Brand** | Simple entity with name, slug, country, logo. |
| **OTP Verification** | Pre-registration OTP stored in `otp_verifications` table. 6-digit code with 10-min expiry. Metadata stores hashed password and user details for deferred user creation. |

---

## 13. Logging

- **Winston** logger with file and console transports
- Error logs: `logs/error.log` (5MB, 5 files rotation)
- Combined logs: `logs/combined.log` (5MB, 5 files rotation)
- Request correlation IDs via `x-correlation-id` header or auto-generated
- Structured JSON logging in production, colorized simple format in development

---

## 14. Comprehensive Product Creation (RPC)

The `create_comprehensive_product(payload JSONB)` stored procedure enables atomic creation of a product with all related data in a single database transaction.

### Payload Structure
```json
{
  "productData": {
    "title": "...", "shortDescription": "...", "description": "...",
    "highlight": ["..."], "basePrice": 100, "currency": "INR", "city": "...",
    "sku": "...", "productType": "bookset", "metadata": {}
  },
  "productType": "bookset",
  "brandData": { "brandId": "uuid" },
  "warehouseData": { "warehouseId": "uuid" },
  "retailerId": "uuid",
  "categories": [{ "id": "uuid" }],
  "schoolData": { "schoolId": "uuid", "grade": "10th", "mandatory": false },
  "productOptions": [
    {
      "name": "Set Type", "position": 1, "isRequired": true,
      "values": ["Bookset", "Notebooks"]
    }
  ],
  "variants": [
    {
      "sku": "SKU-001", "price": 500, "compareAtPrice": 600,
      "stock": 50, "weight": 1.5,
      "option1": "Bookset", "option2": "Large", "option3": null,
      "metadata": {}
    }
  ],
  "images": [
    { "url": "https://...", "altText": "...", "sortOrder": 0, "isPrimary": true }
  ]
}
```

Option values also support object format with image: `{ "value": "Red", "imageUrl": "https://..." }`

### Processing Steps
1. Generate SKU if not provided
2. Link existing brand (by brandId)
3. Link existing warehouse (by warehouseId)
4. Insert product record (with highlight, city)
5. Link brand via `product_brands`
6. Link warehouse via `products_warehouse`
7. Link categories via `product_categories`
8. Link school via `product_schools`
9. Create option attributes + values (with image_url, price_modifier)
10. Create variants (resolves option value names to UUIDs via internal mapping — `option1` maps to productOptions[0])
11. Create images
12. Return `{ product_id, sku, status: 'success' }`

---

## 15. Docker Configuration

### Dockerfile
- Node.js 18 Alpine base
- Simple copy + install
- Exposes PORT from env

### docker-compose.yml
- Service: `api` (the Node.js server)
- Health check via `healthcheck.js`
- Environment variables from `.env`
