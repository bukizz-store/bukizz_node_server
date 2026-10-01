import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getSupabase } from "../src/db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const migrationFilePath = path.resolve(__dirname, "../src/db/migrations/migration_product_fees_and_order_components.sql");
const sql = fs.readFileSync(migrationFilePath, "utf8");

async function checkStatus(supabase) {
  console.log("\n🔍 Verifying schema status against Supabase...");

  let productFeesOk = false;
  let orderItemComponentsOk = false;
  let orderItemFeesOk = false;
  let orderItemsRollupOk = false;

  // 1. Check product_fees table
  try {
    const { data, error } = await supabase.from("product_fees").select("id").limit(1);
    if (!error) {
      productFeesOk = true;
      console.log("  ✅ Table 'product_fees' exists and is accessible.");
    } else {
      console.log(`  ❌ Table 'product_fees': ${error.message} (${error.code})`);
    }
  } catch (err) {
    console.log(`  ❌ Table 'product_fees': ${err.message}`);
  }

  // 2. Check order_item_components table
  try {
    const { data, error } = await supabase.from("order_item_components").select("id").limit(1);
    if (!error) {
      orderItemComponentsOk = true;
      console.log("  ✅ Table 'order_item_components' exists and is accessible.");
    } else {
      console.log(`  ❌ Table 'order_item_components': ${error.message} (${error.code})`);
    }
  } catch (err) {
    console.log(`  ❌ Table 'order_item_components': ${err.message}`);
  }

  // 3. Check order_item_fees table
  try {
    const { data, error } = await supabase.from("order_item_fees").select("id").limit(1);
    if (!error) {
      orderItemFeesOk = true;
      console.log("  ✅ Table 'order_item_fees' exists and is accessible.");
    } else {
      console.log(`  ❌ Table 'order_item_fees': ${error.message} (${error.code})`);
    }
  } catch (err) {
    console.log(`  ❌ Table 'order_item_fees': ${err.message}`);
  }

  // 4. Check order_items rollup columns
  try {
    const { data, error } = await supabase.from("order_items").select("id, taxable_amount, total_vendor_fees, vendor_net_payout").limit(1);
    if (!error) {
      orderItemsRollupOk = true;
      console.log("  ✅ Rollup columns exist on 'order_items' table.");
    } else {
      console.log(`  ❌ Column on 'order_items': ${error.message}`);
    }
  } catch (err) {
    console.log(`  ❌ Column on 'order_items': ${err.message}`);
  }

  return { productFeesOk, orderItemComponentsOk, orderItemFeesOk, orderItemsRollupOk };
}

async function run() {
  console.log("============================================================");
  console.log("   Product Fees & Order Components Migration Runner");
  console.log("============================================================");

  await connectDB();
  const supabase = getSupabase();

  // Try RPC execution
  console.log("\nAttempting automated DDL execution via exec_sql RPC...");
  try {
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ sql_query: sql }),
    });

    if (rpcResp.ok) {
      console.log("✅ Migration executed directly via exec_sql RPC!");
    } else {
      const errText = await rpcResp.text();
      console.log(`⚠️ exec_sql returned status ${rpcResp.status}: ${errText}`);
    }
  } catch (err) {
    console.log(`⚠️ exec_sql call failed: ${err.message}`);
  }

  const status = await checkStatus(supabase);
  if (status.productFeesOk && status.orderItemComponentsOk && status.orderItemFeesOk && status.orderItemsRollupOk) {
    console.log("\n🎉 All migration components exist in Supabase!");
  } else {
    console.log("\n⚠️ Some components need to be created in Supabase SQL editor.");
  }
}

run().catch(console.error);
