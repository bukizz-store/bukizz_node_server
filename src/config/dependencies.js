import { UserRepository } from "../repositories/userRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { SchoolRepository } from "../repositories/schoolRepository.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { OrderEventRepository } from "../repositories/orderEventRepository.js";
import { OrderQueryRepository } from "../repositories/orderQueryRepository.js";
import { UserService } from "../services/userService.js";
import { AuthService } from "../services/authService.js";
import { ProductService } from "../services/productService.js";
import { SchoolService } from "../services/schoolService.js";
import { OrderService } from "../services/orderService.js";
import { UserController } from "../controllers/userController.js";
import { AuthController } from "../controllers/authController.js";
import { ProductController } from "../controllers/productController.js";
import { SchoolController } from "../controllers/schoolController.js";
import { OrderController } from "../controllers/orderController.js";
import { getDB } from "../db/index.js";

/**
 * Creates and configures dependency injection container
 * Enables easy testing by allowing mock injection
 * @param {Object} overrides - Override dependencies for testing
 * @returns {Object} Container with all dependencies
 */
export function createDependencies(overrides = {}) {
  const db = overrides.db || getDB();

  // Get Supabase client for repositories that need it
  const supabase = db.supabase ? db.supabase() : db;

  // Repositories (Data Access Layer)
  const userRepository =
    overrides.userRepository || new UserRepository(supabase);
  const productRepository =
    overrides.productRepository || new ProductRepository(db);
  const schoolRepository =
    overrides.schoolRepository || new SchoolRepository(db);
  const orderRepository = overrides.orderRepository || new OrderRepository(db);
  const orderEventRepository =
    overrides.orderEventRepository || new OrderEventRepository(db);
  const orderQueryRepository =
    overrides.orderQueryRepository || new OrderQueryRepository(db);

  // Services (Business Logic Layer)
  const userService = overrides.userService || new UserService(userRepository);
  const authService = overrides.authService || new AuthService(userRepository);
  const productService =
    overrides.productService || new ProductService(productRepository);
  const schoolService =
    overrides.schoolService || new SchoolService(schoolRepository);
  const orderService =
    overrides.orderService ||
    new OrderService(
      orderRepository,
      productRepository,
      userRepository,
      orderEventRepository,
      orderQueryRepository
    );

  // Controllers (Request Handling Layer)
  const userController =
    overrides.userController || new UserController(userService);
  const authController =
    overrides.authController || new AuthController(authService);
  const productController =
    overrides.productController || new ProductController(productService);
  const schoolController =
    overrides.schoolController || new SchoolController(schoolService);
  const orderController =
    overrides.orderController || new OrderController(orderService);

  return {
    // Database
    db,

    // Repositories
    userRepository,
    productRepository,
    schoolRepository,
    orderRepository,
    orderEventRepository,
    orderQueryRepository,

    // Services
    userService,
    authService,
    productService,
    schoolService,
    orderService,

    // Controllers
    userController,
    authController,
    productController,
    schoolController,
    orderController,
  };
}
