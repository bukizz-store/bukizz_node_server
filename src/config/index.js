import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Application configuration object
 * Centralizes all environment variables with validation and defaults
 */
export const config = {
  // Server configuration
  port: parseInt(process.env.PORT) || 5000,
  env: process.env.NODE_ENV || "development",

  // Database configuration
  database: {
    // Supabase configuration
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    // MySQL configuration (for the comprehensive schema)
    mysql: {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "school_ecom",
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    },
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },

  // Security configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    rateLimitWindowMs:
      parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  },

  // CORS configuration
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },

  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    uploadDir: process.env.UPLOAD_DIR || "uploads/",
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || "app.log",
  },

  // External services
  services: {
    email: {
      provider: process.env.EMAIL_PROVIDER || "supabase",
      apiKey: process.env.EMAIL_API_KEY,
    },
    payment: {
      provider: process.env.PAYMENT_PROVIDER || "razorpay",
      apiKey: process.env.PAYMENT_API_KEY,
      apiSecret: process.env.PAYMENT_API_SECRET,
    },
  },
};

/**
 * Validate required configuration
 * Throws error if critical config is missing
 */
export function validateConfig() {
  const required = ["JWT_SECRET", "SUPABASE_URL", "SUPABASE_ANON_KEY"];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

// Validate config on import
validateConfig();
