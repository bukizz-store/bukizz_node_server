import { getSupabase } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";
import RetailerRepository from "../repositories/retailerRepository.js";
import { imageService } from "./imageService.js";

/**
 * Retailer Service
 * Handles business logic for retailer operations
 */
export class RetailerService {
  constructor() {
    this.retailerRepo = new RetailerRepository(getSupabase());
    this.bucketName = "retailers";
  }

  /**
   * Onboard retailer (Upload signature and save profile)
   * @param {string} retailerId - User ID
   * @param {Object} data - Form data
   * @param {Object} signatureFile - Uploaded file object
   * @returns {Object} Created retailer profile
   */
  async onboardRetailer(retailerId, data, signatureFile) {
    try {
      // 0. Verify the retailer exists in the users table (FK requirement)
      const supabase = getSupabase();
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("id", retailerId)
        .single();

      if (userError || !userRow) {
        logger.error("Retailer user not found in users table", { retailerId });
        throw new AppError(
          "User record not found. Please re-register or contact support.",
          404,
        );
      }

      let signatureUrl = null;

      // 1. Upload signature if provided
      if (signatureFile) {
        // Path: retailer/{retailer_id}/signature/{filename}
        const timestamp = Date.now();
        const cleanName = signatureFile.originalname.replace(
          /[^a-zA-Z0-9.-]/g,
          "_",
        );
        const folderPath = `retailer/${retailerId}/signature`;
        // We'll let imageService generate the full path, but we want control over the folder
        // Actually imageService.uploadImage takes folderPath.
        // But imageService implementation appends random stuff.
        // "const fileName = `${finalFolder}/${timestamp}-${random}-${cleanName}`;"

        const uploadResult = await imageService.uploadImage(
          signatureFile,
          this.bucketName,
          folderPath,
        );
        signatureUrl = uploadResult.url;
      } else {
        // If updating without new signature, check if we need to keep existing?
        // For now, if no file, we assume signatureUrl is not generated here.
        // It might be passed in body if reusing? But usually file upload implies new.
        if (data.existingSignatureUrl) {
          signatureUrl = data.existingSignatureUrl;
        }
      }

      // 2. Prepare data for repository
      const retailerData = {
        retailerId,
        displayName: data.displayName,
        ownerName: data.ownerName,
        gstin: data.gstin,
        pan: data.pan,
        signatureUrl: signatureUrl,
      };

      // 3. Save to database
      const result = await this.retailerRepo.createOrUpdate(retailerData);

      return result;
    } catch (error) {
      logger.error("Error in onboardRetailer:", error);
      throw error;
    }
  }

  /**
   * Update retailer profile (partial update for business details)
   * @param {string} retailerId - User ID
   * @param {Object} data - Update data fields
   * @param {Object} signatureFile - Optional new signature file
   */
  async updateRetailerProfile(retailerId, data, signatureFile) {
    try {
      // Fetch existing data
      const existingProfile = await this.retailerRepo.findById(retailerId);
      if (!existingProfile) {
        throw new AppError("Retailer profile not found.", 404);
      }

      let signatureUrl = existingProfile.signatureUrl;

      // Upload new signature if provided
      if (signatureFile) {
        const folderPath = `retailer/${retailerId}/signature`;
        const uploadResult = await imageService.uploadImage(
          signatureFile,
          this.bucketName,
          folderPath,
        );
        signatureUrl = uploadResult.url;
      }

      // Merge details
      const updatedData = {
        retailerId,
        displayName:
          data.displayName !== undefined
            ? data.displayName
            : existingProfile.displayName,
        ownerName:
          data.ownerName !== undefined
            ? data.ownerName
            : existingProfile.ownerName,
        gstin: data.gstin !== undefined ? data.gstin : existingProfile.gstin,
        pan: data.pan !== undefined ? data.pan : existingProfile.pan,
        signatureUrl: signatureUrl,
      };

      const result = await this.retailerRepo.createOrUpdate(updatedData);

      return result;
    } catch (error) {
      logger.error("Error in updateRetailerProfile:", error);
      throw error;
    }
  }

  /**
   * Get retailer profile
   * @param {string} retailerId
   * @returns {Object} Retailer profile
   */
  async getRetailerProfile(retailerId) {
    return await this.retailerRepo.findById(retailerId);
  }

  /**
   * Check if retailer has completed their profile (retailer_data exists)
   * @param {string} retailerId
   * @returns {Object} { hasData, missingFields[] }
   */
  async checkRetailerDataStatus(retailerId) {
    const profile = await this.retailerRepo.findById(retailerId);

    if (!profile) {
      return {
        hasData: false,
        isComplete: false,
        missingFields: [
          "displayName",
          "ownerName",
          "gstin",
          "pan",
          "signatureUrl",
        ],
        message: "Retailer profile not found. Please complete your onboarding.",
      };
    }

    // Check which required fields are missing
    const requiredFields = [
      "displayName",
      "ownerName",
      "gstin",
      "pan",
      "signatureUrl",
    ];
    const missingFields = requiredFields.filter((field) => !profile[field]);

    return {
      hasData: true,
      isComplete: missingFields.length === 0,
      missingFields,
      message:
        missingFields.length === 0
          ? "Retailer profile is complete."
          : `Missing fields: ${missingFields.join(", ")}`,
    };
  }

  /**
   * Check retailer verification/authorization status from users table
   * @param {string} retailerId
   * @returns {Object} { isVerified, isActive, status, message }
   */
  async checkVerificationStatus(retailerId) {
    const supabase = getSupabase();

    const { data: user, error } = await supabase
      .from("users")
      .select("id, full_name, email, is_active, deactivation_reason, role")
      .eq("id", retailerId)
      .single();

    if (error || !user) {
      throw new AppError("Retailer not found", 404);
    }

    if (user.role !== "retailer") {
      throw new AppError("User is not a retailer", 400);
    }

    let status;
    let message;

    if (user.is_active && user.deactivation_reason === "authorized") {
      status = "authorized";
      message = "Your account is verified and active.";
    } else if (!user.is_active && user.deactivation_reason === "unauthorized") {
      status = "pending";
      message =
        "Your account is pending admin approval. Please contact the admin.";
    } else if (!user.is_active) {
      status = "deactivated";
      message = "Your account has been deactivated. Please contact the admin.";
    } else {
      status = "active";
      message = "Your account is active.";
    }

    return {
      isVerified: user.is_active && user.deactivation_reason === "authorized",
      isActive: user.is_active,
      status,
      deactivationReason: user.deactivation_reason,
      message,
    };
  }
}

export const retailerService = new RetailerService();
