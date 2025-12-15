# Bukizz School E-commerce Backend API

A comprehensive Node.js/Express backend API for the Bukizz school supplies e-commerce platform with MySQL/Supabase integration.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **User Management**: Registration, profile management, address management
- **Product Catalog**: Product management with categories, variants, and school associations
- **School Management**: School profiles with product associations by grade
- **Order Management**: Complete order lifecycle management
- **Security**: Rate limiting, input validation, security middleware
- **Database**: MySQL with Supabase support
- **Logging**: Structured logging with Winston
- **Testing**: Jest test framework setup
- **Docker**: Containerized deployment ready

## 📁 Project Structure

```
server/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── services/         # Business logic
│   ├── repositories/     # Database access layer
│   ├── models/          # Validation schemas
│   ├── middleware/      # Express middleware
│   ├── utils/          # Utility functions
│   ├── routes/         # Route definitions
│   └── db/             # Database connection
├── tests/              # Test files
├── .env.example        # Environment template
├── package.json        # Dependencies and scripts
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Multi-service setup
└── README.md           # Documentation
```

## 🛠️ Installation

### Prerequisites

- Node.js 18+
- MySQL 8.0+ or Supabase account
- Redis (optional, for caching)

### Local Development

1. **Clone and setup:**

```bash
cd server
cp .env.example .env
# Edit .env with your configuration
```

2. **Install dependencies:**

```bash
npm install
```

3. **Database setup:**

```bash
# For MySQL, create database and run migrations
npm run db:migrate
npm run db:seed
```

4. **Start development server:**

```bash
npm run dev
```

### Docker Development

```bash
# Build and run with Docker Compose
docker-compose up --build

# Or run individual services
docker-compose up mysql redis
npm run dev
```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

- **Database**: MySQL or Supabase credentials
- **JWT**: Secret keys and expiration times
- **Security**: CORS origins, rate limits
- **External**: Payment gateway, email service

### Database Options

**Option 1: MySQL**

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=bukizz_db
DB_USER=your_username
DB_PASSWORD=your_password
```

**Option 2: Supabase**

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 📚 API Documentation

### Base URL

```
Development: http://localhost:3000/api/v1
Production: https://api.bukizz.com/api/v1
```

### Authentication Endpoints

- `POST /auth/register` - Register new user
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user profile
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password

### Product Endpoints

- `GET /products` - Search products with filters
- `GET /products/:id` - Get product details
- `GET /products/featured` - Get featured products
- `GET /products/type/:type` - Get products by type
- `GET /products/school/:schoolId` - Get school products
- `POST /products` - Create product (admin)
- `PUT /products/:id` - Update product (admin)

### School Endpoints

- `GET /schools` - Search schools
- `GET /schools/:id` - Get school details
- `GET /schools/city/:city` - Get schools by city
- `GET /schools/popular` - Get popular schools
- `POST /schools` - Create school (admin)
- `PUT /schools/:id` - Update school (admin)

### Order Endpoints

- `POST /orders` - Create new order
- `GET /orders/my-orders` - Get user orders
- `GET /orders/:id` - Get order details
- `POST /orders/:id/cancel` - Cancel order
- `PUT /orders/:id/status` - Update order status (admin)
- `POST /orders/calculate-summary` - Calculate order summary

### User Endpoints

- `GET /users/:userId` - Get user profile
- `PUT /users/:userId` - Update user profile
- `GET /users/:userId/addresses` - Get user addresses
- `POST /users/:userId/addresses` - Add user address

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Configurable rate limits per endpoint
- **Input Validation**: Joi schema validation for all inputs
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Configurable cross-origin requests
- **Security Headers**: Helmet.js security middleware
- **Password Hashing**: bcryptjs for secure password storage

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📝 Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests
npm run lint       # Run ESLint
npm run docker:build   # Build Docker image
npm run docker:run     # Run Docker container
```

## 🚀 Deployment

### Docker Deployment

```bash
# Build and deploy
docker build -t bukizz-server .
docker run -p 3000:3000 bukizz-server
```

### Production Considerations

1. **Environment**: Set `NODE_ENV=production`
2. **Database**: Use managed database service
3. **Logging**: Configure log aggregation
4. **Monitoring**: Set up health checks and metrics
5. **SSL**: Enable HTTPS in production
6. **Scaling**: Use load balancer for multiple instances

## 🏗️ Architecture

### Layered Architecture

1. **Routes Layer**: HTTP routing and middleware
2. **Controllers Layer**: Request/response handling
3. **Services Layer**: Business logic
4. **Repository Layer**: Database access
5. **Database Layer**: MySQL/Supabase integration

### Design Patterns

- **Dependency Injection**: Modular service initialization
- **Repository Pattern**: Database abstraction
- **Middleware Pattern**: Request processing pipeline
- **Error Handling**: Centralized error management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and add tests
4. Run linting and tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- Create an issue for bug reports
- Check existing issues for known problems
- Contact: support@bukizz.com
