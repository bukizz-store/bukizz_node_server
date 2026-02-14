import { retailerSchoolService } from "../services/retailerSchoolService.js";
import { logger } from "../utils/logger.js";

/**
 * Retailer School Controller
 * Handles HTTP requests for retailer-school linking
 */
export class RetailerSchoolController {
    /**
     * Link a retailer to a school
     * POST /api/v1/retailer-schools/link
     * Body: { schoolId, retailerId?, status?, productType? }
     */
    linkRetailerToSchool = async (req, res) => {
        try {
            const { schoolId, status, productType } = req.body;
            const retailerId = req.body.retailerId || req.user?.id;

            const result = await retailerSchoolService.linkRetailerToSchool({
                retailerId,
                schoolId,
                status,
                productType,
            });

            return res.status(201).json({
                success: true,
                ...result,
            });
        } catch (error) {
            logger.error("linkRetailerToSchool controller error:", error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message,
            });
        }
    };

    /**
     * Get all schools connected to a retailer with full school info
     * GET /api/v1/retailer-schools/connected-schools
     * GET /api/v1/retailer-schools/connected-schools/:retailerId
     * Query: ?status=approved|pending|rejected
     */
    getConnectedSchools = async (req, res) => {
        try {
            const retailerId = req.params.retailerId || req.user?.id;
            const filters = {};
            if (req.query.status) {
                filters.status = req.query.status;
            }

            const result = await retailerSchoolService.getConnectedSchools(retailerId, filters);

            return res.status(200).json({
                success: true,
                ...result,
            });
        } catch (error) {
            logger.error("getConnectedSchools controller error:", error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message,
            });
        }
    };

    /**
     * Get all retailers connected to a school
     * GET /api/v1/retailer-schools/connected-retailers/:schoolId
     * Query: ?status=approved|pending|rejected
     */
    getConnectedRetailers = async (req, res) => {
        try {
            const { schoolId } = req.params;
            const filters = {};
            if (req.query.status) {
                filters.status = req.query.status;
            }

            const result = await retailerSchoolService.getConnectedRetailers(schoolId, filters);

            return res.status(200).json({
                success: true,
                ...result,
            });
        } catch (error) {
            logger.error("getConnectedRetailers controller error:", error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message,
            });
        }
    };

    /**
     * Update link status
     * PATCH /api/v1/retailer-schools/status
     * Body: { retailerId?, schoolId, currentStatus, newStatus }
     */
    updateLinkStatus = async (req, res) => {
        try {
            const { schoolId, currentStatus, newStatus } = req.body;
            const retailerId = req.body.retailerId || req.user?.id;

            const result = await retailerSchoolService.updateLinkStatus(
                retailerId,
                schoolId,
                currentStatus,
                newStatus
            );

            return res.status(200).json({
                success: true,
                ...result,
            });
        } catch (error) {
            logger.error("updateLinkStatus controller error:", error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message,
            });
        }
    };

    /**
     * Update product types for a link
     * PATCH /api/v1/retailer-schools/product-type
     * Body: { retailerId?, schoolId, status, productType }
     */
    updateProductType = async (req, res) => {
        try {
            const { schoolId, status, productType } = req.body;
            const retailerId = req.body.retailerId || req.user?.id;

            const result = await retailerSchoolService.updateProductType(
                retailerId,
                schoolId,
                status,
                productType
            );

            return res.status(200).json({
                success: true,
                ...result,
            });
        } catch (error) {
            logger.error("updateProductType controller error:", error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message,
            });
        }
    };

    /**
     * Remove a retailer-school link
     * DELETE /api/v1/retailer-schools
     * Body: { retailerId?, schoolId, status }
     */
    unlinkRetailerFromSchool = async (req, res) => {
        try {
            const { schoolId, status } = req.body;
            const retailerId = req.body.retailerId || req.user?.id;

            const result = await retailerSchoolService.unlinkRetailerFromSchool(
                retailerId,
                schoolId,
                status
            );

            return res.status(200).json({
                success: true,
                ...result,
            });
        } catch (error) {
            logger.error("unlinkRetailerFromSchool controller error:", error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message,
            });
        }
    };
}

export const retailerSchoolController = new RetailerSchoolController();
