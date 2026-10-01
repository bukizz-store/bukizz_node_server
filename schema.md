## Table `addresses`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `user_id`        | `uuid`        | Nullable    |
| `label`          | `varchar`     | Nullable    |
| `recipient_name` | `varchar`     | Nullable    |
| `phone`          | `varchar`     | Nullable    |
| `line1`          | `varchar`     | Nullable    |
| `line2`          | `varchar`     | Nullable    |
| `city`           | `varchar`     | Nullable    |
| `state`          | `varchar`     | Nullable    |
| `postal_code`    | `varchar`     | Nullable    |
| `country`        | `varchar`     | Nullable    |
| `lat`            | `float8`      | Nullable    |
| `lng`            | `float8`      | Nullable    |
| `student_name`   | `varchar`     | Nullable    |
| `id`             | `uuid`        | Primary     |
| `is_default`     | `bool`        | Nullable    |
| `is_active`      | `bool`        | Nullable    |
| `created_at`     | `timestamptz` |             |

## Table `admin_role_permissions`

### Columns

| Name            | Type          | Constraints |
| --------------- | ------------- | ----------- |
| `role_id`       | `uuid`        |             |
| `permission_id` | `uuid`        |             |
| `id`            | `uuid`        | Primary     |
| `created_at`    | `timestamptz` |             |
| `updated_at`    | `timestamptz` |             |

## Table `admin_roles`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `role_name`   | `varchar`     | Unique      |
| `description` | `text`        | Nullable    |
| `id`          | `uuid`        | Primary     |
| `created_at`  | `timestamptz` |             |
| `updated_at`  | `timestamptz` |             |

## Table `admin_scopes`

### Columns

| Name          | Type                      | Constraints |
| ------------- | ------------------------- | ----------- |
| `user_id`     | `uuid`                    |             |
| `entity_type` | `admin_scope_entity_type` |             |
| `entity_id`   | `uuid`                    | Nullable    |
| `id`          | `uuid`                    | Primary     |
| `created_at`  | `timestamptz`             |             |
| `updated_at`  | `timestamptz`             |             |

## Table `admin_user_roles`

### Columns

| Name         | Type          | Constraints |
| ------------ | ------------- | ----------- |
| `user_id`    | `uuid`        |             |
| `role_id`    | `uuid`        |             |
| `id`         | `uuid`        | Primary     |
| `created_at` | `timestamptz` |             |

## Table `allowed_pincodes`

### Columns

| Name         | Type          | Constraints |
| ------------ | ------------- | ----------- |
| `pincode`    | `varchar`     | Unique      |
| `id`         | `uuid`        | Primary     |
| `is_active`  | `bool`        | Nullable    |
| `created_at` | `timestamptz` | Nullable    |
| `updated_at` | `timestamptz` | Nullable    |

## Table `banners`

### Columns

| Name                | Type          | Constraints |
| ------------------- | ------------- | ----------- |
| `desktop_image_url` | `text`        |             |
| `mobile_image_url`  | `text`        |             |
| `alt_text`          | `varchar`     | Nullable    |
| `redirect_url`      | `text`        | Nullable    |
| `id`                | `uuid`        | Primary     |
| `sort_order`        | `int4`        | Nullable    |
| `is_active`         | `bool`        | Nullable    |
| `created_at`        | `timestamptz` | Nullable    |
| `updated_at`        | `timestamptz` | Nullable    |
| `cities`            | `_text`       | Nullable    |
| `pages`             | `_text`       | Nullable    |

## Table `brands`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `name`        | `varchar`     |             |
| `slug`        | `varchar`     | Unique      |
| `description` | `text`        | Nullable    |
| `country`     | `varchar`     | Nullable    |
| `logo_url`    | `text`        | Nullable    |
| `metadata`    | `jsonb`       | Nullable    |
| `id`          | `uuid`        | Primary     |
| `is_active`   | `bool`        | Nullable    |
| `created_at`  | `timestamptz` |             |
| `updated_at`  | `timestamptz` |             |

## Table `categories`

### Columns

| Name                 | Type          | Constraints |
| -------------------- | ------------- | ----------- |
| `name`               | `varchar`     |             |
| `slug`               | `varchar`     | Unique      |
| `description`        | `text`        | Nullable    |
| `parent_id`          | `uuid`        | Nullable    |
| `image`              | `text`        | Nullable    |
| `product_attributes` | `_jsonb`      | Nullable    |
| `id`                 | `uuid`        | Primary     |
| `is_active`          | `bool`        | Nullable    |
| `created_at`         | `timestamptz` |             |

## Table `closing_fee_slabs`

Tiered closing fees determined by unit selling price

### Columns

| Name         | Type          | Constraints |
| ------------ | ------------- | ----------- |
| `max_price`  | `numeric`     | Nullable    |
| `id`         | `uuid`        | Primary     |
| `min_price`  | `numeric`     |             |
| `fee_amount` | `numeric`     |             |
| `is_active`  | `bool`        |             |
| `created_at` | `timestamptz` |             |
| `updated_at` | `timestamptz` |             |

## Table `delivery_partner_data`

### Columns

| Name                         | Type          | Constraints |
| ---------------------------- | ------------- | ----------- |
| `user_id`                    | `uuid`        | Unique      |
| `profile_photo_url`          | `text`        |             |
| `vehicle_details`            | `jsonb`       |             |
| `documents`                  | `jsonb`       |             |
| `bank_account_name`          | `varchar`     | Nullable    |
| `bank_account_number_masked` | `varchar`     | Nullable    |
| `bank_ifsc`                  | `varchar`     | Nullable    |
| `razorpay_fund_account_id`   | `varchar`     | Nullable    |
| `id`                         | `uuid`        | Primary     |
| `kyc_status`                 | `varchar`     |             |
| `is_cod_eligible`            | `bool`        |             |
| `created_at`                 | `timestamptz` |             |
| `updated_at`                 | `timestamptz` |             |
| `bank_verification_status`   | `varchar`     | Nullable    |

## Table `dp_cash_remittances`

### Columns

| Name           | Type          | Constraints |
| -------------- | ------------- | ----------- |
| `dp_id`        | `uuid`        |             |
| `order_ids`    | `_uuid`       |             |
| `amount`       | `numeric`     |             |
| `approved_at`  | `timestamptz` | Nullable    |
| `approved_by`  | `uuid`        | Nullable    |
| `id`           | `uuid`        | Primary     |
| `status`       | `varchar`     | Nullable    |
| `submitted_at` | `timestamptz` | Nullable    |

## Table `dp_ledgers`

### Columns

| Name               | Type                  | Constraints |
| ------------------ | --------------------- | ----------- |
| `dp_user_id`       | `uuid`                |             |
| `order_id`         | `uuid`                | Nullable    |
| `transaction_type` | `dp_transaction_type` |             |
| `amount`           | `numeric`             |             |
| `description`      | `text`                | Nullable    |
| `return_id`        | `uuid`                | Nullable    |
| `id`               | `uuid`                | Primary     |
| `created_at`       | `timestamptz`         |             |

## Table `fee_configurations`

Admin-configurable system charges and platform fees

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `config_key`  | `varchar`     | Unique      |
| `name`        | `varchar`     |             |
| `description` | `text`        | Nullable    |
| `updated_by`  | `uuid`        | Nullable    |
| `id`          | `uuid`        | Primary     |
| `fee_type`    | `varchar`     |             |
| `amount`      | `numeric`     |             |
| `gst_rate`    | `numeric`     |             |
| `is_active`   | `bool`        |             |
| `created_at`  | `timestamptz` |             |
| `updated_at`  | `timestamptz` |             |

## Table `gst_slabs`

Master GST tax slabs mapped to HSN/SAC codes

### Columns

| Name              | Type          | Constraints |
| ----------------- | ------------- | ----------- |
| `rate_percentage` | `numeric`     | Unique      |
| `hsn_sac_code`    | `varchar`     | Nullable    |
| `description`     | `varchar`     | Nullable    |
| `id`              | `uuid`        | Primary     |
| `is_active`       | `bool`        |             |
| `created_at`      | `timestamptz` |             |
| `updated_at`      | `timestamptz` |             |

## Table `invoices`

GST tax invoices and fee receipts for orders and vendor settlements

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `invoice_number` | `varchar`     | Unique      |
| `invoice_type`   | `varchar`     |             |
| `order_id`       | `uuid`        |             |
| `order_item_id`  | `uuid`        | Nullable    |
| `retailer_id`    | `uuid`        | Nullable    |
| `customer_id`    | `uuid`        |             |
| `id`             | `uuid`        | Primary     |
| `financial_year` | `varchar`     |             |
| `city_code`      | `varchar`     |             |
| `taxable_amount` | `numeric`     |             |
| `cgst_amount`    | `numeric`     |             |
| `sgst_amount`    | `numeric`     |             |
| `igst_amount`    | `numeric`     |             |
| `total_amount`   | `numeric`     |             |
| `metadata`       | `jsonb`       | Nullable    |
| `issued_at`      | `timestamptz` | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |

## Table `order_events`

### Columns

| Name              | Type           | Constraints |
| ----------------- | -------------- | ----------- |
| `order_id`        | `uuid`         |             |
| `previous_status` | `order_status` | Nullable    |
| `new_status`      | `order_status` |             |
| `changed_by`      | `uuid`         | Nullable    |
| `note`            | `text`         | Nullable    |
| `metadata`        | `jsonb`        | Nullable    |
| `order_item_id`   | `uuid`         | Nullable    |
| `id`              | `uuid`         | Primary     |
| `created_at`      | `timestamptz`  |             |

## Table `order_item_components`

Itemized components and tax snapshots for kits and standalone products in orders

### Columns

| Name              | Type          | Constraints |
| ----------------- | ------------- | ----------- |
| `order_item_id`   | `uuid`        |             |
| `component_title` | `varchar`     |             |
| `hsn_sac_code`    | `varchar`     |             |
| `id`              | `uuid`        | Primary     |
| `quantity`        | `int4`        |             |
| `unit_price`      | `numeric`     |             |
| `total_price`     | `numeric`     |             |
| `gst_rate`        | `numeric`     |             |
| `base_price`      | `numeric`     |             |
| `cgst_amount`     | `numeric`     |             |
| `sgst_amount`     | `numeric`     |             |
| `igst_amount`     | `numeric`     |             |
| `sort_order`      | `int4`        | Nullable    |
| `created_at`      | `timestamptz` | Nullable    |

## Table `order_item_fees`

Itemized fee deductions and customer surcharges per order item for tax audit and settlements

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `order_item_id`    | `uuid`        |             |
| `retailer_id`      | `uuid`        | Nullable    |
| `payer_party`      | `varchar`     |             |
| `fee_code`         | `varchar`     |             |
| `fee_name`         | `varchar`     |             |
| `applied_rate`     | `numeric`     | Nullable    |
| `id`               | `uuid`        | Primary     |
| `calculation_type` | `varchar`     |             |
| `taxable_amount`   | `numeric`     |             |
| `gst_rate`         | `numeric`     |             |
| `hsn_sac_code`     | `varchar`     |             |
| `cgst_amount`      | `numeric`     |             |
| `sgst_amount`      | `numeric`     |             |
| `igst_amount`      | `numeric`     |             |
| `total_fee_amount` | `numeric`     |             |
| `created_at`       | `timestamptz` | Nullable    |

## Table `order_items`

### Columns

| Name                    | Type           | Constraints     |
| ----------------------- | -------------- | --------------- |
| `order_id`              | `uuid`         |                 |
| `product_id`            | `uuid`         | Nullable        |
| `variant_id`            | `uuid`         | Nullable        |
| `sku`                   | `varchar`      | Nullable        |
| `title`                 | `varchar`      | Nullable        |
| `product_snapshot`      | `jsonb`        | Nullable        |
| `warehouse_id`          | `uuid`         | Nullable        |
| `dispatch_id`           | `varchar`      | Nullable Unique |
| `parent_item_id`        | `uuid`         | Nullable        |
| `locked_by`             | `uuid`         | Nullable        |
| `locked_at`             | `timestamptz`  | Nullable        |
| `packed_at`             | `timestamptz`  | Nullable        |
| `id`                    | `uuid`         | Primary         |
| `quantity`              | `int4`         |                 |
| `unit_price`            | `numeric`      |                 |
| `total_price`           | `numeric`      |                 |
| `created_at`            | `timestamptz`  |                 |
| `status`                | `order_status` | Nullable        |
| `delivery_fee`          | `numeric`      |                 |
| `platform_fee`          | `numeric`      |                 |
| `packaging_hours`       | `int4`         | Nullable        |
| `delivery_hours`        | `int4`         | Nullable        |
| `gst_rate`              | `numeric`      | Nullable        |
| `base_price`            | `numeric`      | Nullable        |
| `cgst_amount`           | `numeric`      | Nullable        |
| `sgst_amount`           | `numeric`      | Nullable        |
| `igst_amount`           | `numeric`      | Nullable        |
| `vendor_platform_fee`   | `numeric`      | Nullable        |
| `vendor_commission_fee` | `numeric`      | Nullable        |
| `vendor_closing_fee`    | `numeric`      | Nullable        |
| `vendor_collection_fee` | `numeric`      | Nullable        |
| `vendor_shipping_fee`   | `numeric`      | Nullable        |
| `vendor_fee_gst`        | `numeric`      | Nullable        |
| `vendor_tcs_amount`     | `numeric`      | Nullable        |
| `is_component`          | `bool`         | Nullable        |
| `taxable_amount`        | `numeric`      | Nullable        |
| `total_vendor_fees`     | `numeric`      | Nullable        |
| `vendor_net_payout`     | `numeric`      | Nullable        |

## Table `order_queries`

### Columns

| Name          | Type           | Constraints |
| ------------- | -------------- | ----------- |
| `order_id`    | `uuid`         |             |
| `user_id`     | `uuid`         |             |
| `subject`     | `varchar`      |             |
| `message`     | `text`         |             |
| `attachments` | `jsonb`        | Nullable    |
| `metadata`    | `jsonb`        | Nullable    |
| `id`          | `uuid`         | Primary     |
| `priority`    | `varchar`      | Nullable    |
| `status`      | `query_status` | Nullable    |
| `created_at`  | `timestamptz`  |             |
| `updated_at`  | `timestamptz`  |             |

## Table `order_returns`

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `order_id`         | `uuid`        |             |
| `order_item_id`    | `uuid`        | Nullable    |
| `return_type`      | `varchar`     |             |
| `reason_code`      | `varchar`     |             |
| `reason_text`      | `text`        | Nullable    |
| `proof_image_url`  | `text`        | Nullable    |
| `initiated_by`     | `uuid`        | Nullable    |
| `pickup_dp_id`     | `uuid`        | Nullable    |
| `warehouse_id`     | `uuid`        |             |
| `pickup_address`   | `jsonb`       | Nullable    |
| `distance_km`      | `numeric`     | Nullable    |
| `incentive_amount` | `numeric`     | Nullable    |
| `picked_up_at`     | `timestamptz` | Nullable    |
| `completed_at`     | `timestamptz` | Nullable    |
| `id`               | `uuid`        | Primary     |
| `status`           | `varchar`     |             |
| `created_at`       | `timestamptz` |             |
| `updated_at`       | `timestamptz` |             |

## Table `orders`

### Columns

| Name                                 | Type           | Constraints |
| ------------------------------------ | -------------- | ----------- |
| `order_number`                       | `varchar`      | Unique      |
| `user_id`                            | `uuid`         | Nullable    |
| `shipping_address`                   | `jsonb`        | Nullable    |
| `billing_address`                    | `jsonb`        | Nullable    |
| `contact_phone`                      | `varchar`      | Nullable    |
| `contact_email`                      | `varchar`      | Nullable    |
| `payment_method`                     | `varchar`      | Nullable    |
| `payment_status`                     | `varchar`      | Nullable    |
| `warehouse_id`                       | `uuid`         | Nullable    |
| `metadata`                           | `jsonb`        | Nullable    |
| `delivery_distance_km`               | `numeric`      | Nullable    |
| `delivery_incentive_amount`          | `numeric`      | Nullable    |
| `payment_collection_method`          | `text`         | Nullable    |
| `estimated_delivery_at`              | `timestamptz`  | Nullable    |
| `packaging_deadline_at`              | `timestamptz`  | Nullable    |
| `id`                                 | `uuid`         | Primary     |
| `status`                             | `order_status` | Nullable    |
| `total_amount`                       | `numeric`      |             |
| `currency`                           | `bpchar`       | Nullable    |
| `created_at`                         | `timestamptz`  |             |
| `updated_at`                         | `timestamptz`  |             |
| `cart_platform_fee`                  | `numeric`      | Nullable    |
| `cart_platform_fee_gst`              | `numeric`      | Nullable    |
| `instant_refund_fee`                 | `numeric`      | Nullable    |
| `cancellation_retained_delivery_fee` | `numeric`      | Nullable    |

## Table `otp_verifications`

### Columns

| Name         | Type          | Constraints |
| ------------ | ------------- | ----------- |
| `email`      | `text`        | Primary     |
| `otp`        | `text`        |             |
| `metadata`   | `jsonb`       | Nullable    |
| `created_at` | `timestamptz` | Nullable    |

## Table `password_resets`

### Columns

| Name         | Type          | Constraints |
| ------------ | ------------- | ----------- |
| `user_id`    | `uuid`        |             |
| `token_hash` | `varchar`     |             |
| `expires_at` | `timestamptz` |             |
| `used_at`    | `timestamptz` | Nullable    |
| `id`         | `uuid`        | Primary     |
| `created_at` | `timestamptz` |             |

## Table `permissions`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `action_name` | `varchar`     | Unique      |
| `description` | `text`        | Nullable    |
| `id`          | `uuid`        | Primary     |
| `created_at`  | `timestamptz` |             |
| `updated_at`  | `timestamptz` |             |

## Table `processed_webhooks`

### Columns

| Name              | Type          | Constraints |
| ----------------- | ------------- | ----------- |
| `idempotency_key` | `varchar`     | Unique      |
| `event_type`      | `varchar`     |             |
| `payload_hash`    | `varchar`     | Nullable    |
| `result`          | `jsonb`       | Nullable    |
| `id`              | `uuid`        | Primary     |
| `processed_at`    | `timestamptz` |             |
| `created_at`      | `timestamptz` |             |

## Table `product_brands`

### Columns

| Name         | Type   | Constraints |
| ------------ | ------ | ----------- |
| `product_id` | `uuid` | Primary     |
| `brand_id`   | `uuid` | Primary     |

## Table `product_categories`

### Columns

| Name          | Type   | Constraints |
| ------------- | ------ | ----------- |
| `product_id`  | `uuid` | Primary     |
| `category_id` | `uuid` | Primary     |

## Table `product_fees`

Product and variant level fee assignments determining payer party and tax rates

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `product_id`       | `uuid`        |             |
| `variant_id`       | `uuid`        | Nullable    |
| `fee_code`         | `varchar`     |             |
| `fee_name`         | `varchar`     |             |
| `id`               | `uuid`        | Primary     |
| `payer_party`      | `varchar`     |             |
| `calculation_type` | `varchar`     |             |
| `amount_or_rate`   | `numeric`     |             |
| `gst_rate`         | `numeric`     |             |
| `hsn_sac_code`     | `varchar`     |             |
| `is_enabled`       | `bool`        | Nullable    |
| `created_at`       | `timestamptz` | Nullable    |
| `updated_at`       | `timestamptz` | Nullable    |

## Table `product_images`

### Columns

| Name         | Type          | Constraints |
| ------------ | ------------- | ----------- |
| `product_id` | `uuid`        |             |
| `variant_id` | `uuid`        | Nullable    |
| `url`        | `text`        |             |
| `alt_text`   | `varchar`     | Nullable    |
| `id`         | `uuid`        | Primary     |
| `sort_order` | `int4`        | Nullable    |
| `is_primary` | `bool`        | Nullable    |
| `created_at` | `timestamptz` |             |

## Table `product_option_attributes`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `product_id`  | `uuid`        |             |
| `name`        | `varchar`     |             |
| `position`    | `int4`        |             |
| `id`          | `uuid`        | Primary     |
| `is_required` | `bool`        | Nullable    |
| `created_at`  | `timestamptz` |             |

## Table `product_option_values`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `attribute_id`   | `uuid`        |             |
| `value`          | `varchar`     |             |
| `image_url`      | `text`        | Nullable    |
| `id`             | `uuid`        | Primary     |
| `sort_order`     | `int4`        | Nullable    |
| `created_at`     | `timestamptz` |             |
| `price_modifier` | `numeric`     |             |

## Table `product_payment_methods`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `product_id`     | `uuid`        |             |
| `payment_method` | `varchar`     |             |
| `id`             | `uuid`        | Primary     |
| `created_at`     | `timestamptz` |             |

## Table `product_reviews`

### Columns

| Name                   | Type          | Constraints |
| ---------------------- | ------------- | ----------- |
| `product_id`           | `uuid`        |             |
| `user_id`              | `uuid`        |             |
| `order_id`             | `uuid`        | Nullable    |
| `rating`               | `int2`        |             |
| `title`                | `varchar`     | Nullable    |
| `comment`              | `text`        | Nullable    |
| `id`                   | `uuid`        | Primary     |
| `images`               | `_text`       | Nullable    |
| `is_verified_purchase` | `bool`        | Nullable    |
| `is_approved`          | `bool`        | Nullable    |
| `created_at`           | `timestamptz` |             |
| `updated_at`           | `timestamptz` |             |

## Table `product_schools`

### Columns

| Name         | Type      | Constraints |
| ------------ | --------- | ----------- |
| `product_id` | `uuid`    | Primary     |
| `school_id`  | `uuid`    | Primary     |
| `grade`      | `varchar` | Primary     |
| `mandatory`  | `bool`    | Nullable    |

## Table `product_variants`

### Columns

| Name               | Type          | Constraints     |
| ------------------ | ------------- | --------------- |
| `product_id`       | `uuid`        |                 |
| `sku`              | `varchar`     | Nullable Unique |
| `price`            | `numeric`     | Nullable        |
| `compare_at_price` | `numeric`     | Nullable        |
| `weight`           | `numeric`     | Nullable        |
| `option_value_1`   | `uuid`        | Nullable        |
| `option_value_2`   | `uuid`        | Nullable        |
| `option_value_3`   | `uuid`        | Nullable        |
| `gst_slab_id`      | `uuid`        | Nullable        |
| `id`               | `uuid`        | Primary         |
| `stock`            | `int4`        | Nullable        |
| `metadata`         | `jsonb`       | Nullable        |
| `created_at`       | `timestamptz` |                 |
| `updated_at`       | `timestamptz` |                 |

## Table `products`

### Columns

| Name                | Type           | Constraints     |
| ------------------- | -------------- | --------------- |
| `sku`               | `varchar`      | Nullable Unique |
| `title`             | `varchar`      |                 |
| `short_description` | `varchar`      | Nullable        |
| `description`       | `text`         | Nullable        |
| `id`                | `uuid`         | Primary         |
| `product_type`      | `product_type` | Nullable        |
| `metadata`          | `jsonb`        | Nullable        |
| `city`              | `varchar`      | Nullable        |
| `highlight`         | `jsonb`        | Nullable        |
| `base_price`        | `numeric`      |                 |
| `currency`          | `bpchar`       | Nullable        |
| `is_active`         | `bool`         | Nullable        |
| `created_at`        | `timestamptz`  |                 |
| `updated_at`        | `timestamptz`  |                 |
| `delivery_charge`   | `numeric`      | Nullable        |
| `is_deleted`        | `bool`         | Nullable        |
| `packaging_hours`   | `int4`         |                 |
| `delivery_hours`    | `int4`         |                 |
| `average_rating`    | `numeric`      | Nullable        |
| `total_reviews`     | `int4`         | Nullable        |

## Table `products_warehouse`

### Columns

| Name           | Type   | Constraints |
| -------------- | ------ | ----------- |
| `warehouse_id` | `uuid` |             |
| `product_id`   | `uuid` | Primary     |

## Table `refresh_tokens`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `user_id`     | `uuid`        |             |
| `token_hash`  | `varchar`     |             |
| `device_info` | `varchar`     | Nullable    |
| `expires_at`  | `timestamptz` |             |
| `revoked_at`  | `timestamptz` | Nullable    |
| `id`          | `uuid`        | Primary     |
| `created_at`  | `timestamptz` |             |

## Table `retailer_bank_accounts`

### Columns

| Name                       | Type          | Constraints |
| -------------------------- | ------------- | ----------- |
| `retailer_id`              | `uuid`        |             |
| `account_holder_name`      | `text`        |             |
| `account_number_encrypted` | `text`        |             |
| `account_number_masked`    | `text`        |             |
| `ifsc_code`                | `varchar`     |             |
| `bank_name`                | `text`        |             |
| `branch_name`              | `text`        | Nullable    |
| `id`                       | `uuid`        | Primary     |
| `account_type`             | `varchar`     |             |
| `is_primary`               | `bool`        |             |
| `created_at`               | `timestamptz` | Nullable    |
| `updated_at`               | `timestamptz` | Nullable    |

## Table `retailer_commissions`

Vendor-specific commission rates with optional product type and category specificity

### Columns

| Name                    | Type           | Constraints |
| ----------------------- | -------------- | ----------- |
| `retailer_id`           | `uuid`         |             |
| `product_type`          | `product_type` | Nullable    |
| `category_id`           | `uuid`         | Nullable    |
| `commission_percentage` | `numeric`      |             |
| `id`                    | `uuid`         | Primary     |
| `is_active`             | `bool`         |             |
| `created_at`            | `timestamptz`  |             |
| `updated_at`            | `timestamptz`  |             |

## Table `retailer_data`

### Columns

| Name            | Type          | Constraints |
| --------------- | ------------- | ----------- |
| `retailer_id`   | `uuid`        | Primary     |
| `display_name`  | `text`        | Nullable    |
| `owner_name`    | `text`        | Nullable    |
| `gstin`         | `text`        | Nullable    |
| `pan`           | `text`        | Nullable    |
| `signature_url` | `text`        | Nullable    |
| `created_at`    | `timestamptz` |             |
| `updated_at`    | `timestamptz` |             |

## Table `retailer_general_access`

### Columns

| Name           | Type          | Constraints |
| -------------- | ------------- | ----------- |
| `retailer_id`  | `uuid`        | Unique      |
| `id`           | `uuid`        | Primary     |
| `category_ids` | `jsonb`       |             |
| `created_at`   | `timestamptz` |             |
| `updated_at`   | `timestamptz` |             |

## Table `retailer_school_access`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `id`             | `uuid`        | Primary     |
| `retailer_id`    | `uuid`        |             |
| `school_id`      | `uuid`        |             |
| `allowed_grades` | `jsonb`       |             |
| `allowed_types`  | `jsonb`       |             |
| `created_at`     | `timestamptz` |             |
| `updated_at`     | `timestamptz` |             |

## Table `retailer_schools`

### Columns

| Name           | Type          | Constraints |
| -------------- | ------------- | ----------- |
| `retailer_id`  | `uuid`        | Primary     |
| `school_id`    | `uuid`        | Primary     |
| `warehouse_id` | `uuid`        | Nullable    |
| `status`       | `varchar`     | Primary     |
| `product_type` | `jsonb`       | Nullable    |
| `created_at`   | `timestamptz` |             |
| `updated_at`   | `timestamptz` |             |

## Table `retailer_warehouse`

This is the connecting table with retailer and warehouses

### Columns

| Name           | Type   | Constraints |
| -------------- | ------ | ----------- |
| `retailer_id`  | `uuid` |             |
| `warehouse_id` | `uuid` | Primary     |

## Table `school_inquiries`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `school_name`    | `varchar`     |             |
| `city`           | `varchar`     |             |
| `contact_person` | `varchar`     |             |
| `contact_number` | `varchar`     |             |
| `designation`    | `varchar`     | Nullable    |
| `query`          | `text`        | Nullable    |
| `id`             | `uuid`        | Primary     |
| `status`         | `varchar`     |             |
| `created_at`     | `timestamptz` |             |
| `updated_at`     | `timestamptz` |             |

## Table `schools`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `name`        | `varchar`     |             |
| `board`       | `varchar`     | Nullable    |
| `address`     | `jsonb`       | Nullable    |
| `city`        | `varchar`     | Nullable    |
| `state`       | `varchar`     | Nullable    |
| `postal_code` | `varchar`     | Nullable    |
| `contact`     | `jsonb`       | Nullable    |
| `type`        | `text`        | Nullable    |
| `image`       | `text`        | Nullable    |
| `cover_image` | `text`        | Nullable    |
| `city_code`   | `varchar`     | Nullable    |
| `id`          | `uuid`        | Primary     |
| `is_active`   | `bool`        | Nullable    |
| `created_at`  | `timestamptz` |             |
| `sort_order`  | `int4`        | Nullable    |

## Table `seller_ledgers`

### Columns

| Name               | Type                      | Constraints |
| ------------------ | ------------------------- | ----------- |
| `retailer_id`      | `uuid`                    |             |
| `warehouse_id`     | `uuid`                    | Nullable    |
| `order_id`         | `uuid`                    | Nullable    |
| `order_item_id`    | `uuid`                    | Nullable    |
| `transaction_type` | `ledger_transaction_type` |             |
| `entry_type`       | `ledger_entry_type`       |             |
| `amount`           | `numeric`                 |             |
| `trigger_date`     | `timestamptz`             | Nullable    |
| `notes`            | `text`                    | Nullable    |
| `id`               | `uuid`                    | Primary     |
| `settled_amount`   | `numeric`                 |             |
| `status`           | `ledger_status`           |             |
| `created_at`       | `timestamptz`             | Nullable    |
| `updated_at`       | `timestamptz`             | Nullable    |

## Table `settlement_ledger_items`

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `settlement_id`    | `uuid`        |             |
| `ledger_id`        | `uuid`        |             |
| `allocated_amount` | `numeric`     |             |
| `id`               | `uuid`        | Primary     |
| `created_at`       | `timestamptz` | Nullable    |

## Table `settlements`

### Columns

| Name               | Type                | Constraints |
| ------------------ | ------------------- | ----------- |
| `retailer_id`      | `uuid`              |             |
| `admin_id`         | `uuid`              | Nullable    |
| `total_amount`     | `numeric`           |             |
| `receipt_url`      | `text`              | Nullable    |
| `payment_mode`     | `text`              |             |
| `reference_number` | `text`              | Nullable    |
| `id`               | `uuid`              | Primary     |
| `status`           | `settlement_status` |             |
| `notes`            | `text`              | Nullable    |
| `created_at`       | `timestamptz`       | Nullable    |

## Table `transactions`

### Columns

| Name                | Type          | Constraints |
| ------------------- | ------------- | ----------- |
| `order_id`          | `uuid`        | Nullable    |
| `payment_id`        | `varchar`     | Nullable    |
| `gateway_order_id`  | `varchar`     | Nullable    |
| `amount`            | `numeric`     |             |
| `status`            | `varchar`     |             |
| `method`            | `varchar`     | Nullable    |
| `signature`         | `varchar`     | Nullable    |
| `error_code`        | `varchar`     | Nullable    |
| `error_description` | `text`        | Nullable    |
| `id`                | `uuid`        | Primary     |
| `currency`          | `varchar`     | Nullable    |
| `created_at`        | `timestamptz` | Nullable    |
| `updated_at`        | `timestamptz` | Nullable    |

## Table `user_auths`

### Columns

| Name               | Type            | Constraints |
| ------------------ | --------------- | ----------- |
| `user_id`          | `uuid`          |             |
| `provider`         | `auth_provider` |             |
| `provider_user_id` | `varchar`       |             |
| `password_hash`    | `varchar`       | Nullable    |
| `id`               | `uuid`          | Primary     |
| `provider_data`    | `jsonb`         | Nullable    |
| `created_at`       | `timestamptz`   |             |

## Table `users`

### Columns

| Name                        | Type          | Constraints |
| --------------------------- | ------------- | ----------- |
| `full_name`                 | `varchar`     |             |
| `email`                     | `varchar`     | Unique      |
| `phone`                     | `varchar`     | Nullable    |
| `metadata`                  | `jsonb`       | Nullable    |
| `date_of_birth`             | `date`        | Nullable    |
| `gender`                    | `varchar`     | Nullable    |
| `city`                      | `varchar`     | Nullable    |
| `state`                     | `varchar`     | Nullable    |
| `school_id`                 | `uuid`        | Nullable    |
| `last_login_at`             | `timestamptz` | Nullable    |
| `deactivated_at`            | `timestamptz` | Nullable    |
| `deactivation_reason`       | `text`        | Nullable    |
| `verification_token`        | `text`        | Nullable    |
| `verification_token_expiry` | `timestamptz` | Nullable    |
| `retailer_code`             | `varchar`     | Nullable    |
| `id`                        | `uuid`        | Primary     |
| `email_verified`            | `bool`        |             |
| `is_active`                 | `bool`        |             |
| `created_at`                | `timestamptz` |             |
| `updated_at`                | `timestamptz` |             |
| `phone_verified`            | `bool`        | Nullable    |
| `role`                      | `varchar`     | Nullable    |

## Table `variant_addons`

### Columns

| Name                | Type          | Constraints |
| ------------------- | ------------- | ----------- |
| `parent_variant_id` | `uuid`        |             |
| `addon_product_id`  | `uuid`        |             |
| `addon_variant_id`  | `uuid`        | Nullable    |
| `id`                | `uuid`        | Primary     |
| `discount_amount`   | `numeric`     | Nullable    |
| `is_active`         | `bool`        | Nullable    |
| `is_mandatory`      | `bool`        | Nullable    |
| `created_at`        | `timestamptz` | Nullable    |
| `updated_at`        | `timestamptz` | Nullable    |

## Table `variant_commissions`

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `variant_id`       | `uuid`        |             |
| `effective_to`     | `timestamptz` | Nullable    |
| `id`               | `uuid`        | Primary     |
| `commission_type`  | `varchar`     |             |
| `commission_value` | `numeric`     |             |
| `effective_from`   | `timestamptz` |             |
| `created_at`       | `timestamptz` |             |
| `updated_at`       | `timestamptz` |             |

## Table `variant_components`

Loose kit items and components for product variants enabling GST bifurcation

### Columns

| Name                | Type          | Constraints |
| ------------------- | ------------- | ----------- |
| `parent_variant_id` | `uuid`        |             |
| `component_title`   | `varchar`     |             |
| `gst_slab_id`       | `uuid`        |             |
| `hsn_sac_code`      | `varchar`     |             |
| `id`                | `uuid`        | Primary     |
| `quantity`          | `int4`        |             |
| `unit_price`        | `numeric`     |             |
| `compare_at_price`  | `numeric`     |             |
| `sort_order`        | `int4`        | Nullable    |
| `is_active`         | `bool`        | Nullable    |
| `created_at`        | `timestamptz` | Nullable    |
| `updated_at`        | `timestamptz` | Nullable    |

## Table `vendor_b2b_invoices`

Monthly B2B invoices generated for vendor ITC (Input Tax Credit) claims

### Columns

| Name                   | Type          | Constraints |
| ---------------------- | ------------- | ----------- |
| `invoice_number`       | `varchar`     | Unique      |
| `retailer_id`          | `uuid`        |             |
| `billing_month`        | `date`        |             |
| `invoice_pdf_url`      | `text`        | Nullable    |
| `id`                   | `uuid`        | Primary     |
| `taxable_service_fees` | `numeric`     |             |
| `cgst_amount`          | `numeric`     |             |
| `sgst_amount`          | `numeric`     |             |
| `igst_amount`          | `numeric`     |             |
| `total_invoice_amount` | `numeric`     |             |
| `created_at`           | `timestamptz` |             |

## Table `warehouse`

### Columns

| Name             | Type          | Constraints     |
| ---------------- | ------------- | --------------- |
| `name`           | `varchar`     |                 |
| `contact_email`  | `varchar`     | Nullable        |
| `contact_phone`  | `varchar`     | Nullable        |
| `address`        | `uuid`        | Nullable        |
| `website`        | `varchar`     | Nullable        |
| `metadata`       | `jsonb`       | Nullable        |
| `id`             | `uuid`        | Primary         |
| `is_verified`    | `bool`        | Nullable        |
| `warehouse_code` | `varchar`     | Nullable Unique |
| `created_at`     | `timestamptz` |                 |
| `order_sequence` | `int4`        | Nullable        |
| `city_code`      | `varchar`     | Nullable        |

## Custom Types / Enums

### `admin_scope_entity_type`

`SCHOOL` | `CATEGORY` | `RETAILER` | `ALL`

### `auth_provider`

`email` | `google` | `apple` | `dp_pin`

### `dp_transaction_type`

`delivery_earning` | `penalty` | `withdrawal`

### `ledger_entry_type`

`CREDIT` | `DEBIT`

### `ledger_status`

`ON_HOLD` | `PENDING` | `AVAILABLE` | `PARTIALLY_SETTLED` | `SETTLED`

### `ledger_transaction_type`

`ORDER_REVENUE` | `PLATFORM_FEE` | `REFUND_CLAWBACK` | `MANUAL_ADJUSTMENT`

### `order_status`

`initialized` | `processed` | `shipped` | `out_for_delivery` | `delivered` | `cancelled` | `refunded` | `returned` | `rto_initiated` | `rto_in_transit` | `rto_completed` | `return_requested` | `return_pickup_assigned` | `return_in_transit`

### `product_type`

`bookset` | `uniform` | `stationary` | `general` | `school` | `addon`

### `query_status`

`open` | `pending` | `resolved` | `closed`

### `settlement_status`

`COMPLETED` | `FAILED`

## RLS Policies

### `admin_role_permissions`

| Policy                                                | Command | Roles         | Action     | USING  | WITH CHECK |
| ----------------------------------------------------- | ------- | ------------- | ---------- | ------ | ---------- |
| `Authenticated users can read admin role permissions` | SELECT  | authenticated | PERMISSIVE | `true` | —          |

### `admin_user_roles`

| Policy                                          | Command | Roles         | Action     | USING  | WITH CHECK |
| ----------------------------------------------- | ------- | ------------- | ---------- | ------ | ---------- |
| `Authenticated users can read admin user roles` | SELECT  | authenticated | PERMISSIVE | `true` | —          |

### `permissions`

| Policy                                     | Command | Roles         | Action     | USING  | WITH CHECK |
| ------------------------------------------ | ------- | ------------- | ---------- | ------ | ---------- |
| `Authenticated users can read permissions` | SELECT  | authenticated | PERMISSIVE | `true` | —          |

### `retailer_bank_accounts`

| Policy                                 | Command | Roles  | Action     | USING                        | WITH CHECK                   |
| -------------------------------------- | ------- | ------ | ---------- | ---------------------------- | ---------------------------- |
| `retailer_bank_accounts_delete_policy` | DELETE  | public | PERMISSIVE | `(auth.uid() = retailer_id)` | —                            |
| `retailer_bank_accounts_insert_policy` | INSERT  | public | PERMISSIVE | —                            | `(auth.uid() = retailer_id)` |
| `retailer_bank_accounts_select_policy` | SELECT  | public | PERMISSIVE | `(auth.uid() = retailer_id)` | —                            |
| `retailer_bank_accounts_update_policy` | UPDATE  | public | PERMISSIVE | `(auth.uid() = retailer_id)` | —                            |

### `admin_roles`

| Policy                                     | Command | Roles         | Action     | USING  | WITH CHECK |
| ------------------------------------------ | ------- | ------------- | ---------- | ------ | ---------- |
| `Authenticated users can read admin roles` | SELECT  | authenticated | PERMISSIVE | `true` | —          |

### `admin_scopes`

| Policy                                      | Command | Roles         | Action     | USING  | WITH CHECK |
| ------------------------------------------- | ------- | ------------- | ---------- | ------ | ---------- |
| `Authenticated users can read admin scopes` | SELECT  | authenticated | PERMISSIVE | `true` | —          |

### `allowed_pincodes`

| Policy                     | Command | Roles  | Action     | USING  | WITH CHECK |
| -------------------------- | ------- | ------ | ---------- | ------ | ---------- |
| `Allow public read access` | SELECT  | public | PERMISSIVE | `true` | —          |

### `banners`

| Policy                                      | Command | Roles  | Action     | USING  | WITH CHECK |
| ------------------------------------------- | ------- | ------ | ---------- | ------ | ---------- |
| `Public profiles are viewable by everyone.` | SELECT  | public | PERMISSIVE | `true` | —          |

### `product_variants`

| Policy                                    | Command | Roles  | Action     | USING  | WITH CHECK |
| ----------------------------------------- | ------- | ------ | ---------- | ------ | ---------- |
| `Public read access for product variants` | SELECT  | public | PERMISSIVE | `true` | —          |

### `retailer_general_access`

| Policy                                                 | Command | Roles         | Action     | USING  | WITH CHECK |
| ------------------------------------------------------ | ------- | ------------- | ---------- | ------ | ---------- |
| `Authenticated users can read retailer general access` | SELECT  | authenticated | PERMISSIVE | `true` | —          |

### `retailer_school_access`

| Policy                                                | Command | Roles         | Action     | USING  | WITH CHECK |
| ----------------------------------------------------- | ------- | ------------- | ---------- | ------ | ---------- |
| `Authenticated users can read retailer school access` | SELECT  | authenticated | PERMISSIVE | `true` | —          |

### `school_inquiries`

| Policy                                               | Command | Roles               | Action     | USING  | WITH CHECK |
| ---------------------------------------------------- | ------- | ------------------- | ---------- | ------ | ---------- |
| `Allow public insert to school_inquiries`            | INSERT  | anon, authenticated | PERMISSIVE | —      | `true`     |
| `Allow service role full access to school_inquiries` | ALL     | service_role        | PERMISSIVE | `true` | `true`     |

### `transactions`

| Policy                               | Command | Roles  | Action     | USING                                                                                                                                                                                                                                              | WITH CHECK |
| ------------------------------------ | ------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `Admins can manage all transactions` | ALL     | public | PERMISSIVE | `(((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (EXISTS ( SELECT 1    FROM users   WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY (ARRAY[('admin'::character varying)::text, ('system'::character varying)::text]))))))` | —          |
| `Users can view own transactions`    | SELECT  | public | PERMISSIVE | `(auth.uid() IN ( SELECT orders.user_id    FROM orders   WHERE (orders.id = transactions.order_id)))`                                                                                                                                              | —          |

### `product_images`

| Policy                                  | Command | Roles  | Action     | USING  | WITH CHECK |
| --------------------------------------- | ------- | ------ | ---------- | ------ | ---------- |
| `Public read access for product images` | SELECT  | public | PERMISSIVE | `true` | —          |

### `product_option_attributes`

| Policy                                             | Command | Roles  | Action     | USING  | WITH CHECK |
| -------------------------------------------------- | ------- | ------ | ---------- | ------ | ---------- |
| `Public read access for product option attributes` | SELECT  | public | PERMISSIVE | `true` | —          |

### `product_option_values`

| Policy                                         | Command | Roles  | Action     | USING  | WITH CHECK |
| ---------------------------------------------- | ------- | ------ | ---------- | ------ | ---------- |
| `Public read access for product option values` | SELECT  | public | PERMISSIVE | `true` | —          |

### `retailer_data`

| Policy                                       | Command | Roles  | Action     | USING                        | WITH CHECK |
| -------------------------------------------- | ------- | ------ | ---------- | ---------------------------- | ---------- |
| `Retailers can insert/update their own data` | ALL     | public | PERMISSIVE | `(auth.uid() = retailer_id)` | —          |
| `Retailers can view their own data`          | SELECT  | public | PERMISSIVE | `(auth.uid() = retailer_id)` | —          |
