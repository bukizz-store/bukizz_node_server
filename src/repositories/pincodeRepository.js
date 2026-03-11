import { logger } from "../utils/logger.js";

export class PincodeRepository {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    async checkAvailability(pincode) {
        try {
            const { data, error } = await this.supabase
                .from("allowed_pincodes")
                .select("id")
                .eq("pincode", pincode)
                .eq("is_active", true)
                .single();

            if (error && error.code !== "PGRST116") { // PGRST116 is 'not found'
                logger.error("Error checking pincode availability", { pincode, error: error.message });
                throw error;
            }

            return !!data;
        } catch (error) {
            if (error.code === "PGRST116") return false;
            logger.error("System error checking pincode:", error);
            throw error;
        }
    }

    async bulkInsert(pincodes) {
        const uniquePincodes = [...new Set(pincodes.map(p => String(p).trim()))];

        if (uniquePincodes.length === 0) {
            return { inserted: 0, total: 0 };
        }

        const rows = uniquePincodes.map(pincode => ({
            pincode,
            is_active: true,
        }));

        const BATCH_SIZE = 500;
        let totalInserted = 0;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);

            const { data, error } = await this.supabase
                .from("allowed_pincodes")
                .upsert(batch, { onConflict: "pincode", ignoreDuplicates: true })
                .select("id");

            if (error) {
                logger.error("Bulk pincode insert failed", {
                    batch: i / BATCH_SIZE + 1,
                    error: error.message,
                });
                throw error;
            }

            totalInserted += data?.length || 0;
        }

        logger.info("Bulk pincode insert completed", {
            requested: pincodes.length,
            unique: uniquePincodes.length,
            inserted: totalInserted,
        });

        return {
            inserted: totalInserted,
            total: uniquePincodes.length,
        };
    }
}
