import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sql = `
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
`;

async function run() {
    // Use Supabase Management API SQL endpoint
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ sql_query: sql }),
    });

    if (response.ok) {
        console.log("✅ Migration executed successfully via exec_sql RPC!");
        return;
    }

    // If exec_sql RPC doesn't exist, try the pg_query function or just print instructions
    console.log("⚠️  exec_sql RPC not available (status:", response.status, ")");
    console.log("");
    console.log("Please run the migration SQL manually in Supabase Dashboard:");
    console.log("  1. Go to https://supabase.com/dashboard/project/qgufxqbsgewczleennbu/sql/new");
    console.log("  2. Paste the SQL from: server/src/db/migration_create_retailer_bank_accounts.sql");
    console.log("  3. Click 'Run'");
    console.log("");

    // Verify the table after manual creation
    const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/retailer_bank_accounts?select=id&limit=1`, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });

    if (checkResp.ok) {
        console.log("✅ Table 'retailer_bank_accounts' exists and is accessible!");
    } else {
        const err = await checkResp.text();
        console.log("❌ Table not yet created:", err);
    }
}

run().catch(console.error);
