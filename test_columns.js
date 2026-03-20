import { connectDB, getSupabase } from "./src/db/index.js";

async function check() {
  await connectDB();
  const supabase = getSupabase();
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    if (data.length > 0) {
      console.log("Columns:", Object.keys(data[0]));
    } else {
      console.log("No data, cannot see columns this way");
    }
  }
  process.exit(0);
}
check();
