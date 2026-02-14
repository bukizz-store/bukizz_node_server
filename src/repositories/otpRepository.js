import { logger } from "../utils/logger.js";

/**
 * OTP Repository
 * Handles all OTP-related database operations using Supabase
 */
export class OtpRepository {
    constructor(supabase) {
        this.supabase = supabase;
    }

    /**
     * Upsert OTP record
     * @param {string} email - User email
     * @param {string} otp - OTP code
     * @param {object} metadata - Temporary user data
     */
    async upsertOtp(email, otp, metadata) {
        try {
            const { error } = await this.supabase
                .from("otp_verifications")
                .upsert({
                    email: email,
                    otp: otp,
                    created_at: new Date().toISOString(),
                    metadata: metadata
                });

            if (error) throw error;
            return true;
        } catch (error) {
            logger.error("Error upserting OTP:", error);
            throw error;
        }
    }

    /**
     * Find OTP by email
     * @param {string} email - User email
     */
    async findByEmail(email) {
        try {
            const { data, error } = await this.supabase
                .from("otp_verifications")
                .select("*")
                .eq("email", email)
                .single();

            if (error) {
                if (error.code === "PGRST116") return null; // No rows found
                throw error;
            }

            return data;
        } catch (error) {
            logger.error("Error finding OTP by email:", error);
            throw error;
        }
    }

    /**
     * Delete OTP by email
     * @param {string} email - User email
     */
    async deleteByEmail(email) {
        try {
            const { error } = await this.supabase
                .from("otp_verifications")
                .delete()
                .eq("email", email);

            if (error) throw error;
            return true;
        } catch (error) {
            logger.error("Error deleting OTP:", error);
            throw error;
        }
    }
}

export default OtpRepository;
