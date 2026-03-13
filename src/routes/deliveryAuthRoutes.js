import express from "express";
import { validate } from "../middleware/validator.js";
import { userSchemas } from "../models/schemas.js";
import { upload } from "../middleware/upload.js";

/**
 * Delivery Partner Auth Routes Factory
 * @param {Object} dependencies
 * @returns {Router}
 */
export default function deliveryAuthRoutes(dependencies = {}) {
  const router = express.Router();
  const { authController } = dependencies;

  if (!authController) {
    console.error("AuthController not found in dependencies");
    return router;
  }

  router.post(
    "/register",
    upload.fields([
      { name: "profilePhoto", maxCount: 1 },
      { name: "profile_photo", maxCount: 1 },
      { name: "aadhaarFrontPhoto", maxCount: 1 },
      { name: "aadhaarBackPhoto", maxCount: 1 },
      { name: "aadhaarPhoto", maxCount: 1 },
      { name: "aadharPhoto", maxCount: 1 },
      { name: "aadhaar_photo", maxCount: 1 },
      { name: "aadhar_photo", maxCount: 1 },
      { name: "aadhaar_back_photo", maxCount: 1 },
      { name: "panPhoto", maxCount: 1 },
      { name: "pan_photo", maxCount: 1 },
      { name: "drivingLicensePhoto", maxCount: 1 },
      { name: "dlPhoto", maxCount: 1 },
      { name: "driving_license_photo", maxCount: 1 },
      { name: "dl_photo", maxCount: 1 },
    ]),
    validate(userSchemas.deliveryPartnerRegister),
    authController.registerDeliveryPartner,
  );

  router.post(
    "/login",
    validate(userSchemas.deliveryPartnerLogin),
    authController.loginDeliveryPartner,
  );

  return router;
}
