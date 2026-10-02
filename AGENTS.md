# Grocery Platform — Project Instructions

A white-label quick-commerce grocery platform (a simplified Blinkit). One codebase, deployed separately for each client. The goal is the smallest production-capable B1 MVP: for every decision, ask "does this help deliver and operate a real grocery client?" If not, defer it.

`README.md` covers setup and commands. `TODO.md` lists deferred work.

## Repository

- `apps/api`: Fastify modular monolith (TypeScript, Prisma 7.10, PostgreSQL, Redis via ioredis, Zod).
  - Modules live in `src/modules/`: auth, users, stores, categories, products, inventory, cart, orders, payments, delivery, notifications, settings, uploads.
  - Infrastructure is in `src/infrastructure/` (database, redis) and Fastify plugins in `src/plugins/`.
- `apps/admin`: Next.js 16 dashboard for admins and store staff (Tailwind, shadcn/ui). It calls the API only from the server (`API_URL`).
- `apps/customer`, `apps/delivery`: Expo / React Native apps.
- `deploy/`: production stack. `docker/`: dev PostgreSQL and Redis. `packages/`: reserved, currently empty.
- pnpm workspaces and Turborepo. Do not split the backend into microservices.

## B1 scope

- **Customers:** phone OTP, profile, addresses, current location, serviceability, nearest store, catalog and search, cart, checkout (COD and online), order status and live tracking, history, cancellation where allowed.
- **Store staff:** incoming orders, accept, pick, mark items unavailable, pack, ready for pickup, inventory adjustments, product availability.
- **Admins:** dashboard, stores, categories, products, store pricing, inventory, orders, customers, delivery partners, assign/reassign, monitor delivery, cancellation and refunds, delivery charges, basic analytics, settings.
- **Delivery partners:** online/offline, assigned deliveries, accept, navigate to store and customer, pickup, call customer, delivery OTP, mark delivered, history and earnings.

Order lifecycle: `PENDING_PAYMENT → CONFIRMED → STORE_ACCEPTED → PICKING → PACKED → READY_FOR_PICKUP → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED`, plus cancellation where the rules allow. Do not invent states. Record every status change in `OrderStatusHistory`.

**Do not build unless explicitly asked:**
- microservices or a multi-vendor marketplace;
- multi-store carts;
- warehouse features: bins, batches, expiry, suppliers, procurement, purchase orders, stock transfers, barcodes;
- route optimization, delivery batching, dispatch algorithms or a driver marketplace;
- dynamic pricing, wallet, loyalty, referrals, recommendations or a complex coupon engine;
- a custom map engine, chat, an analytics warehouse, or commissions and payouts.

## Domain rules

- **Store selection:** the nearest active store that serves the location and has every cart item in stock.
- **Delivery assignment:** manual. A semi-automatic suggestion is fine.
- **Live tracking:** partner locations go through Redis and realtime. Don't persist every GPS update; `DeliveryLocation` is only for useful history.
- **Catalog:** `Product` is the global catalog entry, `StoreProduct` is one store's price and availability, and `Inventory` is a quantity per `StoreProduct`. Never duplicate products per store. Inventory is only a quantity.
- **Cart:** a cart belongs to one store. Revalidate or clear it when the store changes.
- **Order snapshots:** orders store item names and prices, and the delivery address (name, phone, address lines, landmark, city, state, postal code, latitude, longitude). Never read current product or address data to show an old order.
- **Order creation** is one transaction: validate the cart, store and stock; calculate prices; create the order and items; decrement stock; create the payment; clear the cart; write the first history entry. Never leave a partial order.
- **Stock changes** are atomic (a conditional update inside a transaction), never read, check, then write.
- **Payments:** COD and ONLINE. Provider fields stay generic (`provider`, `transactionId`, `providerOrderId`). Statuses: PENDING, PROCESSING, PAID, FAILED, REFUNDED.
- **Delivery** is separate from the order: Order → Delivery → DeliveryPartner.
  - Partner statuses: OFFLINE, ONLINE, BUSY.
  - Delivery statuses: PENDING, ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, CANCELLED.
- **Money:** `Decimal @db.Decimal(10, 2)` and Decimal arithmetic for subtotals, fees, discounts, totals and payment amounts. Never JavaScript floats.

## Authentication

- **Customers and delivery partners** sign in with phone OTP. OTPs live in Redis with a TTL (`otp:{phone}`); never store them in PostgreSQL.
- **Admins and store staff** sign in to the dashboard with email and password (`POST /auth/login`) and cannot use OTP.
  - Passwords are scrypt hashes (`shared/password.ts`), and failed attempts are rate-limited per email and network.
  - Admins set and reset staff passwords in the dashboard. The first admin, and any admin password reset, uses the `create-admin` script.
- **SMS fallback:** in development, OTPs are written to the API log until an SMS provider is set up. In production, OTP sign-in is unavailable until an admin configures SMS. `OTP_PROVIDER` in the environment overrides the dashboard choice, for recovery.

## White-label

- **No shared-database multi-tenancy.** Each client has its own API, PostgreSQL, Redis, secrets, dashboard and app builds. No `tenantId`.
- **Branding and business settings** (name, logo, colors, currency, timezone, fees, minimum order, service radius, home sections) live in dashboard settings or env defaults, never in business logic.
- **Mobile build settings** (name, package ID, scheme, API URL) are env vars read by each app's `app.config.js`.
- **Secrets** are environment variables. The one exception: payment gateway keys (Razorpay, Cashfree, …) and SMS provider keys (Message Central, …) may also be entered in the dashboard.
  - They're stored AES-256-GCM encrypted with `SECRETS_ENCRYPTION_KEY` and are write-only: the API never returns them.
  - Keys set in the environment take priority.
  - Do not extend this to other secrets without an explicit decision.

## Images

Images are uploaded through the `uploads` module (`POST /images`), converted to WebP in two sizes (1200 px and 400 px), and stored on local disk (`UPLOADS_DIR`). In production Nginx serves `/uploads/` and the daily backup copies the files. Do not add object storage unless a client needs more than one server.

## Security

- Hash passwords and delivery OTPs. OTPs are short-lived.
- The JWT secret comes from the environment. Use Helmet and configure CORS.
- Validate body, query, params and important config with Zod, and keep database constraints too.
- The server calculates all prices and totals and checks stock, store and serviceability. Never trust client input.
- Never expose database credentials or payment secrets.
- Never commit `.env` files, secrets, keys or production credentials. Never reuse development credentials in production.

## Backend code

- Structure: route → handler → service → data access → Prisma. Combine layers in simple modules. No enterprise patterns, no queries scattered through handlers, no business logic in `server.ts`.
- Routes are resource-oriented and predictable (`GET /orders/:id`, `POST /orders/:id/cancel`).
- Paginate and limit lists, and avoid N+1 queries and huge payloads. Use indexes, transactions, Redis caching where useful and WebSockets for realtime. Don't optimize prematurely.

## Prisma 7.10.0

Never upgrade to Prisma 8 or use Prisma 8 APIs; the project hit a 7/8 mismatch before.

- **Files:** the schema is `apps/api/prisma/schema.prisma` and the config is `apps/api/prisma.config.ts`. The client is generated into `apps/api/src/generated/prisma` (generator `prisma-client`), and `DATABASE_URL` comes from the environment.
- **After a schema change,** from `apps/api`: `prisma format`, `prisma validate`, `prisma migrate dev --name <name>`, `prisma generate`, then `pnpm typecheck`. Commit migrations, and don't use `db push`.
- **When `migrate dev` refuses a non-interactive shell:** write the SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then run `prisma migrate deploy`.

## Environment

- **Machine:** Windows with WSL2, project at `/home/piyush/projects/grocery-platform`. Docker Engine runs inside WSL; never suggest Docker Desktop. Node 24, pnpm 11.
- **Dev services** (`docker/docker-compose.yml`): PostgreSQL 17 on host port 5433 (5432 is taken by a Windows PostgreSQL) and Redis 7 on 6379. Database, user and password: `grocery` / `grocery` / `grocery_dev`. These are for development only.
- **Production** (`deploy/`): one Compose stack per client.
  - It runs PostgreSQL, Redis, migrations, the API, the dashboard, Nginx with Let's Encrypt, an uploads volume and daily backups.
  - Configured by `deploy/.env` and `deploy/api.env` on the server. Setup steps are in `deploy/.env.example`.
- **Health check:** `GET /health` returns `status`, `database` and `redis` as `ok`.

## Working style

1. Inspect existing code first. Reuse the infrastructure, make the smallest coherent change, and add no unnecessary abstractions.
2. Don't upgrade major dependencies or add frameworks without approval. Ask before major architectural changes, or when a request conflicts with this file.
3. Done means verified:
   - typecheck;
   - for API work: the success path, invalid input, unauthorized, not found and business-rule failures;
   - for database work: the Prisma steps above.
4. Make logical commits with conventional messages (`feat(orders): …`).
5. Report exactly what changed and what was verified.
