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
}
