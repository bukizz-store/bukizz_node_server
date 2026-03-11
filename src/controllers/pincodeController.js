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

    static async bulkInsert(req, res, next) {
        try {
            const { pincodes } = req.body;

            if (!Array.isArray(pincodes) || pincodes.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "A non-empty array of pincodes is required",
                });
            }

            const invalid = pincodes.filter(p => !/^\d{6}$/.test(String(p).trim()));
            if (invalid.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: "All pincodes must be 6-digit numbers",
                    invalidPincodes: invalid.slice(0, 10),
                });
            }

            const supabase = getSupabase();
            const pincodeRepository = new PincodeRepository(supabase);
            const result = await pincodeRepository.bulkInsert(pincodes);

            res.status(201).json({
                success: true,
                message: `Successfully processed ${result.total} pincodes`,
                data: result,
            });
        } catch (error) {
            logger.error("Bulk pincode insert failed", { error: error.message });
            next(error);
        }
    }
}
