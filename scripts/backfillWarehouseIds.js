/**
 * Backfill script: Update order_items with NULL warehouse_id
 * using the current products_warehouse mapping.
 * 
 * Also sets orders.warehouse_id from the first item's warehouse.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  try {
    // 1. Get all order_items with NULL warehouse_id
    const { data: nullItems, error: e1 } = await supabase
      .from("order_items")
      .select("id, order_id, product_id")
      .is("warehouse_id", null);

    if (e1) {
      console.error("Error fetching null items:", e1);
      process.exit(1);
    }

    console.log(`Found ${nullItems.length} order_items with NULL warehouse_id`);

    if (nullItems.length === 0) {
      console.log("Nothing to backfill.");
      process.exit(0);
    }

    // 2. Get all products_warehouse mappings
    const productIds = [...new Set(nullItems.map((i) => i.product_id).filter(Boolean))];
    const { data: pwMappings, error: e2 } = await supabase
      .from("products_warehouse")
      .select("product_id, warehouse_id")
      .in("product_id", productIds);

    if (e2) {
      console.error("Error fetching products_warehouse:", e2);
      process.exit(1);
    }

    // Build product -> warehouse map
    const warehouseMap = new Map();
    for (const row of pwMappings || []) {
      if (!warehouseMap.has(row.product_id)) {
        warehouseMap.set(row.product_id, row.warehouse_id);
      }
    }

    console.log(`Found ${warehouseMap.size} product->warehouse mappings`);

    // 3. Update order_items
    let updated = 0;
    let skipped = 0;
    const orderWarehouseMap = new Map(); // order_id -> warehouse_id (for backfilling orders table)

    for (const item of nullItems) {
      const warehouseId = warehouseMap.get(item.product_id);
      if (warehouseId) {
        const { error } = await supabase
          .from("order_items")
          .update({ warehouse_id: warehouseId })
          .eq("id", item.id);

        if (error) {
          console.error(`Failed to update item ${item.id}:`, error.message);
        } else {
          updated++;
          // Track first warehouse for each order
          if (!orderWarehouseMap.has(item.order_id)) {
            orderWarehouseMap.set(item.order_id, warehouseId);
          }
        }
      } else {
        skipped++;
      }
    }

    console.log(`\nOrder items: ${updated} updated, ${skipped} skipped (no mapping found)`);

    // 4. Also backfill orders.warehouse_id where NULL
    let ordersUpdated = 0;
    for (const [orderId, warehouseId] of orderWarehouseMap) {
      const { error } = await supabase
        .from("orders")
        .update({ warehouse_id: warehouseId })
        .eq("id", orderId)
        .is("warehouse_id", null);

      if (error) {
        console.error(`Failed to update order ${orderId}:`, error.message);
      } else {
        ordersUpdated++;
      }
    }

    console.log(`Orders: ${ordersUpdated} updated with warehouse_id`);

    // 5. Summary - check remaining NULLs
    const { count: remainingNull } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .is("warehouse_id", null);

    console.log(`\nRemaining order_items with NULL warehouse_id: ${remainingNull}`);

  } catch (err) {
    console.error("Script error:", err);
  }
  process.exit(0);
})();
