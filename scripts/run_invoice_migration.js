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
const PROJECT_REF = "qgufxqbsgewczleennbu";

const migrationFilePath = path.resolve(__dirname, "../src/db/migrations/migration_invoice_system.sql");
const sql = fs.readFileSync(migrationFilePath, "utf8");

async function checkStatus(supabase) {
  console.log("\n🔍 Verifying schema status against Supabase...");

  let invoicesOk = false;
  let usersColumnOk = false;
  let warehouseColumnOk = false;

  // 1. Check invoices table
  try {
    const { data, error } = await supabase.from("invoices").select("id").limit(1);
    if (!error) {
      invoicesOk = true;
      console.log("  ✅ Table 'invoices' exists and is accessible via PostgREST.");
    } else {
      console.log(`  ❌ Table 'invoices': ${error.message} (${error.code})`);
    }
  } catch (err) {
    console.log(`  ❌ Table 'invoices': ${err.message}`);
  }

  // 2. Check users.retailer_code column
  try {
    const { data, error } = await supabase.from("users").select("id, email, retailer_code, role").limit(1);
    if (!error) {
      usersColumnOk = true;
      console.log("  ✅ Column 'retailer_code' exists on 'users' table.");
    } else {
      console.log(`  ❌ Column 'users.retailer_code': ${error.message}`);
    }
  } catch (err) {
    console.log(`  ❌ Column 'users.retailer_code': ${err.message}`);
  }

  // 3. Check warehouse.city_code column
  try {
    const { data, error } = await supabase.from("warehouse").select("id, name, city_code").limit(1);
    if (!error) {
      warehouseColumnOk = true;
      console.log("  ✅ Column 'city_code' exists on 'warehouse' table.");
    } else {
      console.log(`  ❌ Column 'warehouse.city_code': ${error.message}`);
    }
  } catch (err) {
    console.log(`  ❌ Column 'warehouse.city_code': ${err.message}`);
  }

  return { invoicesOk, usersColumnOk, warehouseColumnOk };
}

async function runBackfill(supabase) {
  console.log("\n🔄 Executing backfill via Supabase client for retailer_code...");

  // Fairdeal backfill
  const { data: fairdealUsers, error: fErr } = await supabase
    .from("users")
    .update({ retailer_code: "FAI" })
    .ilike("email", "%fairdeal%")
    .eq("role", "retailer")
    .select("id, email, full_name, retailer_code");

  if (fErr) {
    console.log("  ⚠️ Failed to backfill Fairdeal:", fErr.message);
  } else {
    console.log(`  ✅ Fairdeal retailer backfilled (${fairdealUsers?.length || 0} rows updated):`, fairdealUsers);
  }

  // Tanuj backfill (email)
  const { data: tanujEmailUsers, error: tErr1 } = await supabase
    .from("users")
    .update({ retailer_code: "TAN" })
    .ilike("email", "%tanuj%")
    .eq("role", "retailer")
    .select("id, email, full_name, retailer_code");

  if (tErr1) {
    console.log("  ⚠️ Failed to backfill Tanuj by email:", tErr1.message);
  } else {
    console.log(`  ✅ Tanuj retailer by email backfilled (${tanujEmailUsers?.length || 0} rows updated):`, tanujEmailUsers);
  }

  // Tanuj backfill (full_name)
  const { data: tanujNameUsers, error: tErr2 } = await supabase
    .from("users")
    .update({ retailer_code: "TAN" })
    .ilike("full_name", "%tanuj%")
    .eq("role", "retailer")
    .is("retailer_code", null)
    .select("id, email, full_name, retailer_code");

  if (tErr2) {
    console.log("  ⚠️ Failed to backfill Tanuj by name:", tErr2.message);
  } else {
    console.log(`  ✅ Tanuj retailer by full_name backfilled (${tanujNameUsers?.length || 0} rows updated):`, tanujNameUsers);
  }

  // Set default city_code on warehouse where NULL
  const { data: whUpdated, error: whErr } = await supabase
    .from("warehouse")
    .update({ city_code: "CNB" })
    .is("city_code", null)
    .select("id, warehouse_code, city_code");

  if (whErr) {
    console.log("  ⚠️ Failed to set default city_code on warehouse:", whErr.message);
  } else {
    console.log(`  ✅ Warehouses with default city_code 'CNB': (${whUpdated?.length || 0} rows updated)`);
  }
}

async function run() {
  console.log("============================================================");
  console.log("   Invoice System Migration Runner & Schema Verifier");
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
      console.log(`⚠️  exec_sql RPC returned status ${rpcResp.status}. (Direct DDL RPC not enabled on this Supabase project)`);
    }
  } catch (err) {
    console.log("⚠️  RPC fetch error:", err.message);
  }

  // Check current status
  const status = await checkStatus(supabase);

  if (status.invoicesOk && status.usersColumnOk && status.warehouseColumnOk) {
    console.log("\n🎉 All migration components exist in Supabase!");
    await runBackfill(supabase);
    console.log("\nMigration completed successfully.");
    process.exit(0);
  }

  console.log("\n============================================================");
  console.log("📋 MANUAL EXECUTION REQUIRED IN SUPABASE SQL EDITOR");
  console.log("============================================================");
  console.log("Supabase requires DDL commands (CREATE/ALTER TABLE) to be run");
  console.log("via the SQL Editor in the Dashboard when no Management Token is set.\n");
  console.log(`1. Open Supabase SQL Editor:`);
  console.log(`   👉 https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`);
  console.log(`2. Paste the SQL from:`);
  console.log(`   ${migrationFilePath}\n`);
  console.log("3. Click 'Run' (Ctrl+Enter or Cmd+Enter).\n");
  console.log("4. Re-run this script to verify and apply data backfills:");
  console.log("   node scripts/run_invoice_migration.js\n");
  console.log("============================================================");
}

run().catch((err) => {
  console.error("Migration runner error:", err);
  process.exit(1);
});
