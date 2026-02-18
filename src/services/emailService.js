import nodemailer from "nodemailer";
import { logger } from "../utils/logger.js";

class EmailService {
    constructor() {
        this.transporter = null;
        this.initTransporter();
    }

    async initTransporter() {
        // Evaluate if we should use real SMTP or mock
        // We use real SMTP if:
        // 1. Production environment
        // 2. OR development environment AND explicit SMTP creds are provided
        const useRealSMTP =
            process.env.NODE_ENV === "production" ||
            (process.env.SMTP_HOST && process.env.SMTP_USER);

        if (useRealSMTP) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === "true", // true for 465
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
            logger.info("📧 [EMAIL SERVICE] Using Real SMTP Transporter");
        } else {
            // Mock Transporter
            this.transporter = {
                sendMail: async (mailOptions) => {
                    logger.info("📧 [MOCK EMAIL SERVICE] Sending email:", {
                        to: mailOptions.to,
                        subject: mailOptions.subject,
                    });
                    console.log("\n================ EMAIL PREVIEW ================");
                    console.log(`To: ${mailOptions.to}`);
                    console.log(`Subject: ${mailOptions.subject}`);
                    console.log("-----------------------------------------------");
                    console.log(mailOptions.text || mailOptions.html);
                    console.log("===============================================\n");
                    return { messageId: "mock-email-id" };
                }
            };
            logger.info("📧 [EMAIL SERVICE] Using Mock Transporter (Logs to console)");
        }
    }

    async sendVerificationEmail(email, token, firstName) {
        const verificationUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify-email?token=${token}`;

        const mailOptions = {
            from: '"Bukizz Support" <support@bukizz.in>',
            to: email,
            subject: "Verify your email address - Bukizz",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Bukizz, ${firstName}!</h2>
          <p>Please click the button below to verify your email address:</p>
          <a href="${verificationUrl}" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Verify Email Address
          </a>
          <p>Or copy and paste this link in your browser:</p>
          <p>${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
        </div>
      `,
            text: `Welcome to Bukizz, ${firstName}!\n\nPlease verify your email by clicking: ${verificationUrl}\n\nThis link will expire in 24 hours.`
        };

        try {
            await this.transporter.sendMail(mailOptions);
            logger.info(`Verification email sent to ${email}`);
        } catch (error) {
            logger.error("Error sending verification email:", error);
            throw error;
        }
    }

    async sendOtpEmail(email, otp) {
        try {
            const response = await fetch("https://services.theerrors.in/api/services/email/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": process.env.OTP_EMAIL_API_KEY
                },
                body: JSON.stringify({
                    templateName: "retailer-email-otp-verification",
                    to: email,
                    data: {
                        otp: otp
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`External API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
            }

            const result = await response.json();
            logger.info(`OTP sent to ${email}: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            logger.error("Error sending OTP email:", error);
            throw error;
        }
    }

    async sendForgotPasswordEmail(email, resetToken, firstName) {
        const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

        try {
            const response = await fetch("https://services.theerrors.in/api/services/email/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": process.env.OTP_EMAIL_API_KEY
                },
                body: JSON.stringify({
                    templateName: "forgot-password",
                    to: email,
                    data: {
                        resetUrl: resetUrl,
                        firstName: firstName || "User"
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`External API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
            }

            const result = await response.json();
            logger.info(`Forgot password email sent to ${email}: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            logger.error("Error sending forgot password email:", error);
            throw error;
        }
    }
}

export const emailService = new EmailService();
export default emailService;
