import { UserRepository } from "../repositories/userRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { SchoolRepository } from "../repositories/schoolRepository.js";
import { OrderRepository } from "../repositories/orderRepository.js";
import { OrderEventRepository } from "../repositories/orderEventRepository.js";
import { OrderQueryRepository } from "../repositories/orderQueryRepository.js";
import { WarehouseRepository } from "../repositories/warehouseRepository.js";
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
import { ledgerRepository } from "../repositories/ledgerRepository.js";
import { settlementRepository } from "../repositories/settlementRepository.js";
import { SettlementService } from "../services/settlementService.js";
import { settlementController } from "../controllers/settlementController.js";
import { dpLedgerRepository } from "../repositories/dpLedgerRepository.js";
import { deliveryRepository } from "../repositories/deliveryRepository.js";
import deliveryIncentiveService from "../services/deliveryIncentiveService.js";
import deliveryBankService from "../services/deliveryBankService.js";
import { verifyBankAccount } from "../services/razorpayVerificationService.js";
import { DeliveryController } from "../controllers/deliveryController.js";
import { dpAdminRepository } from "../repositories/dpAdminRepository.js";
import { dpAdminService } from "../services/dpAdminService.js";
import { dpAdminController } from "../controllers/dpAdminController.js";
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
  const warehouseRepository =
    overrides.warehouseRepository || new WarehouseRepository();

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
      orderQueryRepository,
      warehouseRepository,
    );

  // Settlement
  const settlementService =
    overrides.settlementService ||
    new SettlementService(ledgerRepository, settlementRepository);

  // Delivery Incentive
  const dpLedgerRepo = overrides.dpLedgerRepository || dpLedgerRepository;
  const deliveryIncentiveSvc =
    overrides.deliveryIncentiveService ||
    deliveryIncentiveService({
      dpLedgerRepository: dpLedgerRepo,
      orderRepository,
    });

  // Delivery Bank
  const deliveryRepo = overrides.deliveryRepository || deliveryRepository;
  const deliveryBankSvc =
    overrides.deliveryBankService ||
    deliveryBankService({
      deliveryRepository: deliveryRepo,
      verifyBankAccountFn: verifyBankAccount,
    });

  // DP Admin Management
  const dpAdminRepo = overrides.dpAdminRepository || dpAdminRepository;
  const dpAdminSvc =
    overrides.dpAdminService ||
    dpAdminService({ dpAdminRepository: dpAdminRepo });
  const dpAdminCtrl =
    overrides.dpAdminController ||
    dpAdminController({ dpAdminService: dpAdminSvc });

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
  const settlementCtrl =
    overrides.settlementController ||
    settlementController({ settlementService });
  const deliveryCtrl =
    overrides.deliveryController ||
    new DeliveryController({
      deliveryIncentiveService: deliveryIncentiveSvc,
      deliveryBankService: deliveryBankSvc,
    });

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
    ledgerRepository,
    settlementRepository,
    dpLedgerRepository: dpLedgerRepo,
    deliveryRepository: deliveryRepo,
    dpAdminRepository: dpAdminRepo,

    // Services
    userService,
    authService,
    productService,
    schoolService,
    orderService,
    settlementService,
    deliveryIncentiveService: deliveryIncentiveSvc,
    deliveryBankService: deliveryBankSvc,
    dpAdminService: dpAdminSvc,

    // Controllers
    userController,
    authController,
    productController,
    schoolController,
    orderController,
    settlementController: settlementCtrl,
    deliveryController: deliveryCtrl,
    dpAdminCtrl,
  };
}
