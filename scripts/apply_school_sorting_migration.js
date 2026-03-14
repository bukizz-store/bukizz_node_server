import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runMigration() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase configuration.');
    return;
  }

  const sql = `
    ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS city_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
  `;

  console.log('Attempting to apply migration via exec_sql RPC...');

  try {
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
      console.log("✅ Migration applied successfully!");
    } else {
      console.error(`❌ Migration failed (Status: ${response.status})`);
      const errorText = await response.text();
      console.error('Error Details:', errorText);
      console.log('\nPlease run the following SQL manually in your Supabase dashboard:');
      console.log(sql);
    }
  } catch (error) {
    console.error('Error executing migration script:', error);
  }
}

runMigration();
