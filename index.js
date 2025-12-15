import dotenv from "dotenv";
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

// Import middleware and utilities
import { errorHandler } from "./src/middleware/errorHandler.js";
import { logger } from "./src/utils/logger.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

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
    const orderService = new OrderService();
    const userService = new UserService(userRepository);
    const authService = new AuthService();

    // Initialize controllers with services
    const productController = new ProductController(productService);
    const schoolController = new SchoolController(schoolService);
    const orderController = new OrderController(orderService);
    const userController = new UserController(userService);
    const authController = new AuthController(authService);

    // Dependency injection container
    const dependencies = {
      supabase,
      authController,
      userController,
      productController,
      schoolController,
      orderController,
      authService,
      userService,
      productService,
      schoolService,
      orderService,
      productRepository,
      brandRepository,
      productOptionRepository,
      schoolRepository,
      userRepository,
    };

    // Setup all routes
    setupRoutes(app, dependencies);

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
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  process.exit(0);
});

// Start the server
startServer();
