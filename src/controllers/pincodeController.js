import { PincodeRepository } from "../repositories/pincodeRepository.js";
import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";

export class PincodeController {

    static async checkAvailability(req, res, next) {
        try {
            const { pincode } = req.params;

            if (!pincode) {
                return res.status(400).json({
                    success: false,
                    error: "Pincode is required"
                });
            }

            const supabase = getSupabase();
            const pincodeRepository = new PincodeRepository(supabase);
            const isServiceable = await pincodeRepository.checkAvailability(pincode);

            res.json({
                success: true,
                serviceable: isServiceable,
                message: isServiceable
                    ? "Delivery available for this pincode"
                    : "Delivery not available for this pincode"
            });
        } catch (error) {
            logger.error("Pincode check failed", { error: error.message });
            next(error);
        }
    }
}
