import dotenv from "dotenv";
// CRITICAL: Load environment variables BEFORE any other imports
// This ensures Razorpay and other services have access to env vars
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Joi from "joi";

// Import database configuration
import { connectDB, getSupabase } from "./src/db/index.js";

// Import the complete route structure
import { setupRoutes } from "./src/routes/index.js";

// Import Controllers
import { ProductController } from "./src/controllers/productController.js";
import { SchoolController } from "./src/controllers/schoolController.js";
import { OrderController } from "./src/controllers/orderController.js";
import { UserController } from "./src/controllers/userController.js";
import { AuthController } from "./src/controllers/authController.js";

// Import Services
import { ProductService } from "./src/services/productService.js";
import { SchoolService } from "./src/services/schoolService.js";
import { OrderService } from "./src/services/orderService.js";
import { UserService } from "./src/services/userService.js";
import { AuthService } from "./src/services/authService.js";

// Import Repositories
import ProductRepository from "./src/repositories/productRepository.js";
import BrandRepository from "./src/repositories/brandRepository.js";
import ProductOptionRepository from "./src/repositories/productOptionRepository.js";
import { SchoolRepository } from "./src/repositories/schoolRepository.js";
import { UserRepository } from "./src/repositories/userRepository.js";
import { ledgerRepository } from "./src/repositories/ledgerRepository.js";
import { settlementRepository } from "./src/repositories/settlementRepository.js";
import { SettlementService } from "./src/services/settlementService.js";
import { dpLedgerRepository } from "./src/repositories/dpLedgerRepository.js";
import deliveryIncentiveService from "./src/services/deliveryIncentiveService.js";
import { DeliveryController } from "./src/controllers/deliveryController.js";
import { settlementController } from "./src/controllers/settlementController.js";
import { deliveryRepository } from "./src/repositories/deliveryRepository.js";
import deliveryBankService from "./src/services/deliveryBankService.js";
import { verifyBankAccount } from "./src/services/razorpayVerificationService.js";
import { dpAdminRepository } from "./src/repositories/dpAdminRepository.js";
import { dpAdminService } from "./src/services/dpAdminService.js";
import { dpAdminController } from "./src/controllers/dpAdminController.js";

// Import middleware and utilities
import { errorHandler } from "./src/middleware/errorHandler.js";
import { optionalAuth } from "./src/middleware/authMiddleware.js";
import { logger } from "./src/utils/logger.js";
import { config } from "./src/config/index.js";
import { setupCronJobs } from "./src/jobs/cronJobs.js";
import { startEmailWorker, stopEmailWorker } from "./src/workers/emailWorker.js";
import { startWebhookWorker, stopWebhookWorker } from "./src/workers/webhookWorker.js";
import { startOrderWorker, stopOrderWorker } from "./src/workers/orderWorker.js";
import { closeRedisConnection, isRedisConfigured } from "./src/queue/connection.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
// Use the dynamic CORS config that supports local network IPs
app.use(cors(config.cors));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 requests per windowMs for development
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Initialize Supabase client
async function startServer() {
  try {
    // Connect to database
    await connectDB();
    logger.info("Database connected successfully");

    // Get Supabase client
    const supabase = getSupabase();

    // Initialize repositories
    const productRepository = ProductRepository;
    const brandRepository = BrandRepository;
    const productOptionRepository = ProductOptionRepository;
    const schoolRepository = new SchoolRepository();
    const userRepository = new UserRepository(supabase);

    // Initialize services with repositories
    const productService = new ProductService(
      productRepository,
      brandRepository,
      productOptionRepository
    );
    const schoolService = new SchoolService(schoolRepository);
    const orderService = new OrderService(); // Lazy-initialized via getOrderService() in controller
    const userService = new UserService(userRepository);
    const authService = new AuthService();

    // Initialize controllers with services
    const productController = new ProductController(productService);
    const schoolController = new SchoolController(schoolService);
    const orderController = new OrderController(orderService);
    const userController = new UserController(userService);
    const authController = new AuthController(authService);

    // Initialize settlement layer
    const settlementService = new SettlementService(
      ledgerRepository,
      settlementRepository,
    );
    const settlementCtrl = settlementController({ settlementService });

    // Initialize delivery incentive layer
    const deliveryIncentiveSvc = deliveryIncentiveService({
      dpLedgerRepository,
    });
    const deliveryBankSvc = deliveryBankService({
      deliveryRepository,
      verifyBankAccountFn: verifyBankAccount,
    });
    const deliveryCtrl = new DeliveryController({
      deliveryIncentiveService: deliveryIncentiveSvc,
      deliveryBankService: deliveryBankSvc,
    });

    // Initialize DP Admin Layer
    const dpAdminRepo = dpAdminRepository;
    const dpAdminSvc = dpAdminService({ dpAdminRepository: dpAdminRepo });
    const dpAdminCtrl = dpAdminController({ dpAdminService: dpAdminSvc });

    // Dependency injection container
    const dependencies = {
      supabase,
      authController,
      userController,
      productController,
      schoolController,
      orderController,
      settlementController: settlementCtrl,
      deliveryController: deliveryCtrl,
      dpAdminCtrl,
      authService,
      userService,
      productService,
      schoolService,
      orderService,
      settlementService,
      dpAdminService: dpAdminSvc,
      optionalAuth,
      productRepository,
      brandRepository,
      productOptionRepository,
      schoolRepository,
      userRepository,
      ledgerRepository,
      settlementRepository,
      dpAdminRepository: dpAdminRepo,
    };

    // Setup all routes
    setupRoutes(app, dependencies);

    // Serve sitemap statically
    app.get("/sitemap.xml", (req, res) => {
      res.sendFile(path.join(__dirname, "public/sitemap.xml"));
    });

    // Start cron jobs
    setupCronJobs();

    // Start BullMQ workers only in production with Redis configured
    const isDev = process.env.NODE_ENV !== "production";
    if (isRedisConfigured() && !isDev) {
      startEmailWorker();
      startWebhookWorker();
      startOrderWorker();
      logger.info("📧 All queue workers started (Email + Webhook + Order)");
    } else {
      logger.info(
        `📧 Queue workers skipped — ${isDev ? "development mode (direct fallback active)" : "no UPSTASH_REDIS_URL set"}.`
      );
    }

    // Basic auth routes (keeping existing for backward compatibility)
    const loginSchema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
    });

    const registerSchema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      name: Joi.string().min(2).required(),
    });

    // Legacy auth routes
    app.post("/login", async (req, res) => {
      try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
          return res.status(400).json({ error: error.details[0].message });
        }

        const { email, password } = value;

        // Use Supabase auth
        const { data, error: authError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (authError) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        res.json({
          message: "Login successful",
          user: data.user,
          session: data.session,
        });
      } catch (error) {
        logger.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.post("/register", async (req, res) => {
      try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
          return res.status(400).json({ error: error.details[0].message });
        }

        const { email, password, name } = value;

        // Use Supabase auth
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        });

        if (authError) {
          return res.status(400).json({ error: authError.message });
        }

        res.status(201).json({
          message: "Registration successful",
          user: data.user,
        });
      } catch (error) {
        logger.error("Registration error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Error handling middleware (must be last)
    app.use(errorHandler);

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/api`);
      logger.info(`💚 Health Check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  await stopEmailWorker();
  await stopWebhookWorker();
  await stopOrderWorker();
  await closeRedisConnection();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  await stopEmailWorker();
  await stopWebhookWorker();
  await stopOrderWorker();
  await closeRedisConnection();
  process.exit(0);
});

// Start the server
startServer();
