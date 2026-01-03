import express from "express";
import { PincodeController } from "../controllers/pincodeController.js";

export default function pincodeRoutes(dependencies = {}) {
    const router = express.Router();

    router.get("/check/:pincode", PincodeController.checkAvailability);

    return router;
}
