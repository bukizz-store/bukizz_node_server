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
    async upsertOtp(email, otpHash, metadata) {
        try {
            const { error } = await this.supabase
                .from("otp_verifications")
                .upsert({
                    email: email,
                    otp: otpHash,
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
                .ilike("email", email)
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
                .ilike("email", email);

            if (error) throw error;
            return true;
        } catch (error) {
            logger.error("Error deleting OTP:", error);
            throw error;
        }
    }

    /**
     * Update OTP row by email
     * @param {string} email - User email
     * @param {object} updateData - Partial update payload
     */
    async updateByEmail(email, updateData) {
        try {
            const { data, error } = await this.supabase
                .from("otp_verifications")
                .update(updateData)
                .ilike("email", email)
                .select("*")
                .single();

            if (error) {
                if (error.code === "PGRST116") return null;
                throw error;
            }

            return data;
        } catch (error) {
            logger.error("Error updating OTP by email:", error);
            throw error;
        }
    }

    /**
     * Atomically consume OTP row only if email + otp hash match
     * @param {string} email - User email
     * @param {string} otpHash - SHA-256 hash of OTP
     * @returns {object|null} Deleted OTP row or null if no match
     */
    async consumeOtp(email, otpHash) {
        try {
            const { data, error } = await this.supabase
                .from("otp_verifications")
                .delete()
                .ilike("email", email)
                .eq("otp", otpHash)
                .select("*")
                .single();

            if (error) {
                if (error.code === "PGRST116") return null;
                throw error;
            }

            return data;
        } catch (error) {
            logger.error("Error consuming OTP:", error);
            throw error;
        }
    }
}

export default OtpRepository;
