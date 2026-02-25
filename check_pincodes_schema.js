import { createServiceClient } from "./src/db/index.js";
import { logger } from "./src/utils/logger.js";

async function checkPincodes() {
    try {
        const supabase = createServiceClient();

        // Check columns by fetching one row
        const { data, error } = await supabase
            .from("allowed_pincodes")
            .select("*")
            .limit(1);

        if (error) {
            console.error("Error fetching from allowed_pincodes:", error);
            return;
        }

        if (data && data.length > 0) {
            console.log("Sample row from allowed_pincodes:", JSON.stringify(data[0], null, 2));
            console.log("Columns:", Object.keys(data[0]));
        } else {
            console.log("No data found in allowed_pincodes");
        }

        // Also check some schools
        const { data: schools, error: schoolError } = await supabase
            .from("schools")
            .select("id, name, city, postal_code")
            .limit(5);

        if (schoolError) {
            console.error("Error fetching schools:", schoolError);
        } else {
            console.log("Sample schools:", JSON.stringify(schools, null, 2));
        }

    } catch (error) {
        console.error("Script failed:", error);
    }
}

checkPincodes();
