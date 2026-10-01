# Grocery Platform — Project Instructions

## 1. Project Overview

This repository is a reusable white-label grocery delivery platform similar to a simplified Blinkit/quick-commerce system.

The platform is designed to be deployed for multiple independent clients.

The initial goal is a **B1 operational MVP**, not a full Blinkit clone.

The system must support:

* Customer mobile application
* Delivery partner mobile application
* Admin web dashboard
* Store staff web workflow
* Backend API
* PostgreSQL database
* Redis
* Real-time delivery tracking
* Payments
* Notifications
* Inventory
* Order management

The platform should be reusable for multiple clients while keeping each client's production deployment and database isolated.

---

# 2. Core Product Scope

## Customer App

B1 functionality:

* Phone/OTP authentication
* Customer profile
* Saved addresses
* Current location
* Serviceability check
* Store selection
* Product categories
* Product listing
* Product search
* Product details
* Add/remove cart items
* Quantity updates
* Checkout
* COD
* Online payment
* Order creation
* Order status
* Live delivery tracking
* Order history
* Order details
* Cancellation where allowed

---

## Store Staff

B1 functionality:

* Store login
* Incoming orders
* Accept order
* Start picking
* Mark unavailable items
* Pack order
* Mark ready for pickup
* Inventory adjustments
* Basic store product availability

---

## Admin Dashboard

B1 functionality:

* Dashboard
* Stores
* Categories
* Products
* Store-specific pricing
* Inventory
* Orders
* Customers
* Delivery partners
* Assign delivery partner
* Reassign delivery partner
* Monitor delivery
* Cancellation/refund
* Delivery zones/charges
* Basic analytics
* Platform settings

---

## Delivery App

B1 functionality:

* Delivery partner login
* Online/offline status
* Assigned deliveries
* Accept delivery
* Navigate to store
* Pickup order
* Navigate to customer
* Call customer
* Delivery OTP
* Mark delivered
* Delivery history
* Basic earnings/history

---

# 3. Order Lifecycle

The primary B1 order lifecycle is:

PENDING_PAYMENT
→ CONFIRMED
→ STORE_ACCEPTED
→ PICKING
→ PACKED
→ READY_FOR_PICKUP
→ ASSIGNED
→ PICKED_UP
→ OUT_FOR_DELIVERY
→ DELIVERED

Cancellation is supported where business rules permit.

Do not invent additional order states without a concrete requirement.

---

# 4. Store Selection

For B1, store selection should be simple.

Select the nearest active store that:

1. Serves the customer's location.
2. Has all required cart products available/in stock.

Do not implement advanced dispatch or route optimization.

No automated batching is required in B1.

---

# 5. Delivery Assignment

B1 uses:

* Manual assignment
* Semi-automatic assignment if useful

Do NOT build:

* Complex route optimization
* Multi-order batching
* Driver marketplace
* Advanced dispatch algorithms

These are future features.

---

# 6. Live Tracking

Delivery partners periodically send:

* latitude
* longitude

The customer can receive approximate delivery location/ETA.

Redis and WebSockets should be used for real-time delivery updates where appropriate.

Do not persist every GPS update to PostgreSQL unless there is a clear reason.

`DeliveryLocation` exists for useful persisted location history, but high-frequency transient location data should prefer Redis/realtime transport.

---

# 7. Architecture

Use a modular monolith backend initially.

Do NOT split the backend into microservices.

Backend modules:

```text
apps/api/src/modules/

auth/
users/
stores/
products/
inventory/
cart/
orders/
payments/
delivery/
notifications/
settings/
```

Infrastructure:

```text
apps/api/src/infrastructure/

database/
redis/
```

Plugins:

```text
apps/api/src/plugins/
```

---

# 8. Monorepo

Current repository:

```text
grocery-platform/
├── apps/
│   ├── customer/
│   ├── delivery/
│   ├── admin/
│   └── api/
│
├── packages/
│   ├── types/
│   ├── validation/
│   ├── api-client/
│   ├── config/
│   ├── ui/
│   └── utils/
│
├── docker/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

The repository uses pnpm workspaces and Turborepo.

---

# 9. Technology Stack

## Backend

* Node.js
* TypeScript
* Fastify
* Prisma 7.10.0
* PostgreSQL
* Redis
* ioredis
* Zod
* Fastify plugins

## Customer App

* Expo
* React Native
* TypeScript

## Delivery App

* Expo
* React Native
* TypeScript

## Admin

* Next.js 16
* React
* TypeScript
* Tailwind CSS

## Infrastructure

* Docker
* Docker Compose
* Nginx
* VPS for production

---

# 10. Important Version Constraint

The backend currently uses:

```text
Prisma 7.10.0
```

Do NOT upgrade to Prisma 8.

Do NOT introduce Prisma 8 APIs or workflows.

The project previously encountered a Prisma 8/7 mismatch.

Current stable setup:

```text
prisma             7.10.0
@prisma/client     ^7.10.0
```

Use the existing Prisma 7 configuration and API.

---

# 11. Prisma Configuration

Current Prisma schema location:

```text
apps/api/prisma/schema.prisma
```

Current Prisma config:

```text
apps/api/prisma.config.ts
```

Current generator:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

Datasource:

```prisma
datasource db {
  provider = "postgresql"
}
```

DATABASE_URL comes from environment configuration.

Do not hardcode production database credentials.

---

# 12. Current Database Schema

The B1 schema consists of:

```text
User
Address

Store

Category
Product
StoreProduct
Inventory

Cart
CartItem

Order
OrderItem
OrderStatusHistory

Payment

DeliveryPartner
Delivery
DeliveryLocation
```

---

# 13. Database Design Principles

## Product vs StoreProduct

`Product` represents the global catalog definition.

Example:

```text
Product:
Amul Taaza Milk 1L
```

`StoreProduct` represents a store selling that product.

Example:

```text
Store A → ₹68 → available
Store B → ₹70 → available
Store C → unavailable
```

Therefore:

```text
Product
   ↓
StoreProduct
   ↓
Inventory
```

Do not duplicate product records per store.

---

# 14. Inventory

B1 inventory is intentionally simple.

Inventory contains:

```text
quantity
```

Do not introduce:

* warehouse bins
* batch management
* expiry tracking
* supplier management
* stock transfer
* purchase orders

unless explicitly required later.

---

# 15. Cart Rules

A customer cart belongs to one store.

B1 does NOT support multi-store carts.

If the selected store changes and cart items are no longer valid, revalidate/clear the cart.

Do not implement multi-store carts unless explicitly requested.

---

# 16. Order Snapshot Rule

Orders must preserve historical information.

Never depend on current product data to display an old order.

`OrderItem` stores:

```text
productName
quantity
unitPrice
totalPrice
```

The order also stores an address snapshot:

```text
customerName
customerPhone
addressLine1
addressLine2
landmark
city
state
postalCode
latitude
longitude
```

This is intentional.

Customers may change their address or product prices may change after an order.

Historical orders must remain accurate.

---

# 17. Order Status History

Every meaningful order status transition should be recorded in:

```text
OrderStatusHistory
```

Example:

```text
CONFIRMED
STORE_ACCEPTED
PICKING
PACKED
READY_FOR_PICKUP
ASSIGNED
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
```

This supports:

* customer support
* debugging
* analytics
* SLA tracking
* admin audit/history

---

# 18. Payments

B1 supports:

```text
COD
ONLINE
```

Payment provider details must remain generic.

Do not tightly couple the order model to a single payment provider.

Provider-specific fields can include:

```text
provider
transactionId
providerOrderId
```

Payment statuses:

```text
PENDING
PROCESSING
PAID
FAILED
REFUNDED
```

---

# 19. Delivery

Delivery is a separate domain entity from Order.

Relationship:

```text
Order
  ↓
Delivery
  ↓
DeliveryPartner
```

Delivery partner statuses:

```text
OFFLINE
ONLINE
BUSY
```

Delivery statuses:

```text
PENDING
ASSIGNED
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
```

Delivery OTP must never be stored as plaintext.

Store only a secure hash.

---

# 20. Authentication

Initial customer authentication:

```text
Phone number
↓
OTP
↓
Verify
↓
Session/JWT
```

Redis can be used for temporary OTP storage and TTL.

Example conceptual key:

```text
otp:user-phone
```

OTP should expire automatically.

Do not store OTPs permanently in PostgreSQL unless a future requirement explicitly needs an audit trail.

---

# 21. Current Environment

Development environment:

```text
OS: Windows + WSL2
Linux project path:
/home/piyush/projects/grocery-platform
```

Docker Engine runs inside WSL.

Do NOT tell the developer to install Docker Desktop.

Current versions:

```text
Node: 24.21.0
pnpm: 11.8.0
Docker: 29.4.2
Docker Compose: 5.1.3
```

---

# 22. Docker Development Services

Current Docker Compose:

```text
PostgreSQL:
postgres:17-alpine
port: 5432

Redis:
redis:7-alpine
port: 6379
```

Database:

```text
database: grocery
user: grocery
password: grocery_dev
```

Development environment only.

Never copy development credentials into production.

---

# 23. Current API Environment

`apps/api/.env` currently contains development configuration similar to:

```env
NODE_ENV=development
PORT=4000
HOST=0.0.0.0

DATABASE_URL="postgresql://grocery:grocery_dev@localhost:5432/grocery"

REDIS_URL="redis://localhost:6379"

JWT_SECRET="dev-only-change-this-to-a-long-random-secret"
```

Never commit `.env`.

Use environment variables for secrets.

---

# 24. Current API Infrastructure

Database client:

```text
apps/api/src/infrastructure/database/prisma.ts
```

Redis client:

```text
apps/api/src/infrastructure/redis/client.ts
```

Fastify plugins:

```text
apps/api/src/plugins/
```

The API health endpoint is:

```text
GET /health
```

Expected result:

```json
{
  "status": "ok",
  "service": "grocery-api",
  "database": "ok",
  "redis": "ok"
}
```

---

# 25. Prisma Database Workflow

After schema changes:

```bash
pnpm exec prisma format
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec prisma migrate dev --name <migration_name>
pnpm typecheck
```

Do not use `prisma db push` for normal development schema evolution when migrations are intended.

Migrations must be committed to Git.

---

# 26. White-Label Architecture

The platform is NOT using shared-database multi-tenancy initially.

Instead:

```text
Client A
├── API
├── PostgreSQL
├── Redis
├── Admin
└── Mobile builds

Client B
├── API
├── PostgreSQL
├── Redis
├── Admin
└── Mobile builds
```

Same source code.

Separate production deployments.

Separate databases.

Separate Redis instances.

Separate secrets.

Therefore B1 database tables do NOT need:

```text
tenantId
```

Do not add tenantId unless the architecture explicitly changes to shared-database multi-tenancy.

---

# 27. White-Label Configuration

Client-specific configuration should eventually support:

```text
APP_NAME
LOGO
PRIMARY_COLOR
SECONDARY_COLOR
CURRENCY
TIMEZONE
MIN_ORDER_VALUE
DELIVERY_FEE
FREE_DELIVERY_THRESHOLD
SERVICE_RADIUS
FEATURE_FLAGS
HOME_SECTIONS
```

Secrets remain environment variables.

Public branding/configuration should be replaceable without modifying business logic.

---

# 28. What NOT to Build Yet

Avoid premature complexity.

Do NOT implement these in B1 unless explicitly requested:

```text
Microservices
Multi-vendor marketplace
Multi-store carts
Warehouse management
Advanced procurement
Supplier management
Batch tracking
Expiry management
Barcode/bin systems
Automated route optimization
Delivery batching
Dynamic pricing
Wallet
Loyalty
Referrals
Recommendations
AI recommendation engine
Complex coupon engine
Custom map engine
Chat system
Advanced analytics warehouse
Commission/payout system
```

The objective is a working operational MVP.

---

# 29. Backend Coding Rules

Use:

```text
TypeScript
async/await
Zod validation
Prisma
Fastify
dependency separation
modular domain structure
```

Prefer small modules.

Do not put all business logic in `server.ts`.

Do not put database queries directly inside every route handler.

Use:

```text
route
  ↓
controller/handler
  ↓
service
  ↓
repository/data access
  ↓
Prisma
```

For simple modules, some layers can be combined when abstraction would add no value.

Avoid unnecessary enterprise patterns.

---

# 30. API Design

Use resource-oriented HTTP APIs.

Examples:

```text
POST   /auth/send-otp
POST   /auth/verify-otp

GET    /products
GET    /products/:id

GET    /stores
GET    /stores/:id

GET    /cart
POST   /cart/items
PATCH  /cart/items/:id
DELETE /cart/items/:id

POST   /orders
GET    /orders
GET    /orders/:id
POST   /orders/:id/cancel

GET    /delivery/orders
POST   /delivery/orders/:id/accept
POST   /delivery/orders/:id/pickup
POST   /delivery/orders/:id/delivered
```

Exact route structure can evolve, but keep APIs predictable.

---

# 31. Validation

Use Zod for request validation.

Validate:

* request body
* query parameters
* route parameters
* important configuration

Do not trust client input.

Database constraints remain important even when Zod validation exists.

---

# 32. Money

Never use JavaScript floating-point numbers for financial calculations.

Database money fields use:

```prisma
Decimal @db.Decimal(10, 2)
```

When calculating:

```text
subtotal
deliveryFee
discount
total
sellingPrice
payment amount
```

use Decimal-safe arithmetic.

---

# 33. Inventory Concurrency

Inventory updates must be safe against concurrent orders.

Do not implement:

```text
read quantity
↓
if quantity > requested
↓
write quantity - requested
```

as separate unsafe operations.

Use transactional/atomic database operations.

Example conceptual requirement:

```text
available stock = 5
customer A buys 4
customer B buys 3

Only one transaction should succeed if stock is insufficient.
```

This is important for real production behavior.

---

# 34. Order Creation

Order creation should eventually happen transactionally.

Conceptually:

```text
Validate cart
↓
Validate store
↓
Validate inventory
↓
Calculate prices
↓
Create order
↓
Create order items
↓
Reserve/decrement inventory
↓
Create payment
↓
Clear cart
↓
Create initial order history
```

Do not allow partial order creation.

---

# 35. Security

Minimum requirements:

* Passwords should never be stored plaintext.
* OTPs should be short-lived.
* Delivery OTP should be hashed.
* JWT secret must come from environment.
* Validate all input.
* Use Helmet.
* Use CORS configuration.
* Never expose database credentials.
* Never expose payment secrets to clients.
* Never trust client-side prices.
* Server calculates final order totals.
* Server validates inventory.
* Server validates store/serviceability.

---

# 36. Performance

The target is a small-to-medium production deployment.

Do not optimize prematurely.

Use:

```text
PostgreSQL
Redis
database indexes
transactions
appropriate pagination
caching where useful
WebSockets for realtime
```

Avoid unnecessary:

* N+1 queries
* huge API payloads
* unbounded queries
* repeated expensive calculations

---

# 37. Development Workflow

Before changing architecture:

1. Inspect existing code.
2. Understand current implementation.
3. Reuse existing infrastructure.
4. Make the smallest correct change.
5. Run typecheck.
6. Run relevant tests.
7. Only then move to the next feature.

Do not rewrite working infrastructure without a reason.

---

# 38. Git Discipline

Make changes in logical commits.

Example:

```text
feat(api): add grocery domain schema
feat(auth): add phone otp authentication
feat(products): add product catalog
feat/cart): add cart management
feat(orders): add order creation
feat(delivery): add delivery assignment
```

Do not commit:

```text
.env
secrets
API keys
production credentials
```

---

# 39. Current Project Status

Already completed:

* Monorepo created
* pnpm workspace configured
* Turborepo configured
* Customer Expo app created
* Delivery Expo app created
* Admin Next.js app created
* Fastify API created
* TypeScript configured
* PostgreSQL Docker container running
* Redis Docker container running
* Prisma 7.10.0 configured
* Prisma PostgreSQL adapter configured
* Initial Prisma migration created
* Environment validation configured
* Redis client created
* Fastify Prisma/Redis plugin architecture being established
* `/health` endpoint working
* PostgreSQL connectivity verified
* Redis connectivity verified

---

# 40. Immediate Development Goal

The next development phase is:

```text
Database
    ↓
Seed data
    ↓
Auth
    ↓
Stores
    ↓
Categories
    ↓
Products
    ↓
Inventory
    ↓
Cart
    ↓
Orders
    ↓
Payments
    ↓
Delivery
    ↓
Notifications
    ↓
Customer App
    ↓
Admin
    ↓
Delivery App
```

Do not jump randomly between features.

Build backend foundations first.

---

# 41. Immediate Next Task

The immediate next task after establishing the Prisma schema is:

## Create a development seed system.

Seed:

### Admin

```text
role: ADMIN
```

### Customer

```text
role: CUSTOMER
```

### Store

At least one active store.

### Categories

Examples:

```text
Fruits & Vegetables
Dairy & Breakfast
Snacks
Beverages
Staples
Personal Care
Household
```

### Products

Create realistic grocery products.

### StoreProduct

Attach products to the store with:

```text
sellingPrice
mrp
isAvailable
```

### Inventory

Give products realistic stock quantities.

The seed must be idempotent where practical.

Do not create duplicate records every time the seed runs.

---

# 42. Working Style for AI Coding Agents

When asked to implement something:

1. First inspect relevant existing files.
2. Explain what will change briefly.
3. Make the smallest coherent implementation.
4. Preserve the architecture in this document.
5. Do not upgrade major dependencies without explicit approval.
6. Do not introduce new frameworks without justification.
7. Do not replace Prisma 7 with Prisma 8.
8. Do not add unnecessary abstractions.
9. Run typecheck after changes.
10. Report exactly what changed and whether verification passed.

If a requirement conflicts with this document, ask before making a major architectural change.

---

# 43. Definition of Done

A feature is not considered complete merely because the code compiles.

For backend features, verify:

```text
TypeScript compilation
Database behavior
Validation
Error handling
Authorization
Relevant edge cases
```

For API endpoints, verify:

```text
success response
invalid input
unauthorized request
not-found case
business-rule failure
```

For database changes:

```text
prisma format
prisma validate
prisma generate
migration
typecheck
```

---

# 44. Main Principle

Build the smallest production-capable version of the grocery platform.

Do not build a theoretical enterprise platform.

Every architectural decision should answer:

> Does this help us deliver and operate a real grocery delivery client?

If not, defer it.
