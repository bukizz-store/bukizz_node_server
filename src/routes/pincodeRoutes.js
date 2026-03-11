import express from "express";
import { PincodeController } from "../controllers/pincodeController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

export default function pincodeRoutes(dependencies = {}) {
    const router = express.Router();

    router.get("/check/:pincode", PincodeController.checkAvailability);
    router.post("/bulk", authenticateToken, PincodeController.bulkInsert);

    return router;
}
