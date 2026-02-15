/**
 * Migration script: Create retailer_bank_accounts table
 * Run with: node scripts/migrate_bank_accounts.js
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function runMigration() {
    console.log("🚀 Running retailer_bank_accounts migration...\n");

    // Test if table already exists by trying a select
    const { error: checkError } = await supabase
        .from("retailer_bank_accounts")
        .select("id")
        .limit(1);

    if (!checkError) {
        console.log("⚠️  Table 'retailer_bank_accounts' already exists. Skipping migration.");
        console.log("   If you want to recreate it, drop it manually first via Supabase SQL Editor.");
        process.exit(0);
    }

    if (checkError && !checkError.message.includes("does not exist") && checkError.code !== "42P01" && !checkError.message.includes("relation")) {
        console.log("Table may already exist or different error:", checkError.message);
    }

    console.log("📋 Table does not exist yet. Please run the following SQL in your Supabase Dashboard SQL Editor:");
    console.log("   Dashboard → SQL Editor → New Query → Paste & Run\n");
    console.log("─".repeat(80));
    console.log(`
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS retailer_bank_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    retailer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_holder_name TEXT NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    account_number_masked TEXT NOT NULL,
    ifsc_code VARCHAR(11) NOT NULL,
    bank_name TEXT NOT NULL,
    branch_name TEXT,
    account_type VARCHAR(20) NOT NULL DEFAULT 'savings' CHECK (account_type IN ('savings', 'current')),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retailer_bank_accounts_retailer_id ON retailer_bank_accounts(retailer_id);
CREATE INDEX IF NOT EXISTS idx_retailer_bank_accounts_is_primary ON retailer_bank_accounts(retailer_id, is_primary) WHERE is_primary = true;
    `);
    console.log("─".repeat(80));
    console.log("\n✅ After running the SQL, restart your server and test the API endpoints.");
}

runMigration().catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
});
