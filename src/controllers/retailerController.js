import { retailerService } from "../services/retailerService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

export class RetailerController {
    /**
     * Create or update retailer profile
     * POST /api/v1/retailer/data
     */
    createRetailerProfile = asyncHandler(async (req, res) => {
        const retailerId = req.user.id; // From auth middleware
        const data = req.body;
        const signatureFile = req.file;

        if (!retailerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (req.user.role !== "retailer") {
            return res.status(403).json({
                success: false,
                message: "Access denied. User is not a retailer.",
            });
        }

        const result = await retailerService.onboardRetailer(retailerId, data, signatureFile);

        logger.info("Retailer profile created/updated", { retailerId });

        res.status(200).json({
            success: true,
            data: result,
            message: "Retailer profile saved successfully",
        });
    });

    /**
     * Get retailer profile
     * GET /api/v1/retailer/data
     */
    getRetailerProfile = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;

        const result = await retailerService.getRetailerProfile(retailerId);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Retailer profile not found"
            });
        }

        res.status(200).json({
            success: true,
            data: result
        });
    });

    /**
     * Check if retailer has completed their profile data
     * GET /api/v1/retailer/data/status
     */
    /**
     * Check retailer verification/authorization status
     * GET /api/v1/retailer/verification-status
     */
    checkVerificationStatus = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;

        const result = await retailerService.checkVerificationStatus(retailerId);

        res.status(200).json({
            success: true,
            data: result,
        });
    });

    checkRetailerDataStatus = asyncHandler(async (req, res) => {
        const retailerId = req.user.id;

        const result = await retailerService.checkRetailerDataStatus(retailerId);

        res.status(200).json({
            success: true,
            data: result,
        });
    });
}

export const retailerController = new RetailerController();
