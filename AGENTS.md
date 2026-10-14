# Shop Platform — Project Instructions

A white-label single-vendor e-commerce platform, like a Shopify store: one seller per deployment, selling any kind of physical product through a website and a mobile app. Orders ship through third-party logistics (Shiprocket, Fship, any other carrier, or manual self-ship); payment is online through a gateway, or cash on delivery. One codebase, deployed separately for each client. The goal is the smallest production-capable MVP: for every decision, ask "does this help deliver and operate a real shop?" If not, defer it.

`README.md` covers setup and commands. `docs/deployment.md` is the deployment runbook (servers and per-client app builds); follow it for any deploy or build. `TODO.md` lists deferred work.

**Conversion in progress.** This codebase started as a quick-commerce grocery platform and is being converted in phases. Stores and store pricing are gone (one catalog with per-variant price and stock), and orders follow the lifecycle below through the shipping layer (manual and test carriers so far; Shiprocket, Fship, checkout shipping fees and the storefront come in later phases). This file describes the target. Don't extend grocery-only features; remove or convert them only in the phase that covers them.

## Repository

- `apps/api`: Fastify modular monolith (TypeScript, Prisma 7.10, PostgreSQL, Redis via ioredis, Zod).
  - Modules live in `src/modules/`: auth, users, categories, brands, products, catalog-import, inventory, cart, wishlist, coupons, orders, invoices, payments, shipping, returns, ratings, reviews, notifications, reports, settings, uploads.
  - Infrastructure is in `src/infrastructure/` (database, redis) and Fastify plugins in `src/plugins/`.
- `apps/admin`: Next.js 16 dashboard for admins and staff (Tailwind, shadcn/ui). It calls the API only from the server (`API_URL`).
- `apps/web`: Next.js 16 storefront on the client's main domain: home page from the Appearance sections, category and search listings, product pages, cart, checkout, account, and policy pages. It calls the API only from the server (`API_URL`); the customer's token lives in an httpOnly secure cookie.
- `apps/customer`: Expo / React Native customer app. There is no delivery or rider app.
- `deploy/`: production stack. `docker/`: dev PostgreSQL and Redis. `packages/validation`: validation patterns, Indian states and GSTIN checks shared by the API and admin (TypeScript source, no dependencies, no build).
- pnpm workspaces and Turborepo. Do not split the backend into microservices.

## MVP scope

- **Customers (website and app):** phone OTP, profile, addresses, catalog, search and filters, product page with variants and a pincode check, wishlist, cart, checkout (COD and online), order status and shipment tracking, history, cancellation before shipping, returns.
- **Staff:** orders, pack, ship (create the shipment, print the label), inventory adjustments, product availability.
- **Admins:** dashboard, categories, brands, products and variants (price, stock, weight, dimensions), inventory, orders, customers, shipping (carriers, pickup locations, shipments, NDR and RTO), cancellations, returns and refunds, coupons, shipping fees, reports, appearance, website and settings.

Order lifecycle: `PENDING_PAYMENT → CONFIRMED → PACKED → SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`, plus `CANCELLED` (before `SHIPPED`) and `RTO` (returned to origin by the carrier). Do not invent states. Record every status change in `OrderStatusHistory`.

**Do not build unless explicitly asked:**
- microservices, multiple vendors or a marketplace;
- multiple shipments per order, exchanges, digital products or subscriptions, guest checkout;
- live carrier rate shopping (the shipping fee comes from settings);
- warehouse features: bins, batches, expiry, suppliers, procurement, purchase orders, multiple warehouses, barcode scanning (a variant's barcode is just a searchable field);
- an own delivery fleet, rider app or dispatch;
- dynamic pricing, wallet, loyalty, referrals, recommendations or a complex coupon engine;
- chat, an analytics warehouse, or commissions and payouts.

## Domain rules

- **Catalog:** `Product` is the catalog entry: brand, category, tags, HSN/GST, manufacturer, country of origin, and specifications (an ordered list of key/value pairs). Its variants (`ProductVariant`) are the sellable units: SKU, price, `compareAtPrice`, weight (`weightGrams`), dimensions (`lengthCm`, `breadthCm`, `heightCm`), per-order limit and barcode.
  - Products may define up to 3 option axes (`ProductOption` / `ProductOptionValue`, e.g. Size × Colour); each variant picks one value per axis. A product without options has exactly one default variant with an empty `name`.
  - `ProductImage` belongs to the product, optionally to one variant.
  - `Inventory` is one quantity per variant. Inventory is only a quantity.
  - Manual stock changes need a reason (RESTOCK, CORRECTION, DAMAGE) and are logged in `InventoryAdjustment`, as are restocks from returns and RTO.
  - Categories are at most two levels deep; filtering by a category includes its sub-categories.
- **Pickup locations:** `PickupLocation` is an address and phone number carriers collect parcels from. Exactly one is the default.
- **Cart:** one per customer, holding variants. Quantity per item is capped by the variant's limit, `MAX_QUANTITY_PER_ITEM` and the stock.
- **Order snapshots:** order items store the product and variant name, SKU, image, unit price, compare-at price, HSN, GST rate and included tax. Orders store the tax total, shipping fee, COD fee and their tax, and the delivery address (name, phone, address lines, landmark, city, state, pincode, optional latitude and longitude). Never read current product or address data to show an old order.
- **Tax:** prices include GST; the included tax is `amount × rate / (100 + rate)`. An invoice number (`INV/<financial year>/000001`) is assigned when the order is packed.
- **Shipping fee:** from settings (flat rate, free-shipping threshold, COD fee, optional weight slabs), calculated on the server with Decimal and snapshotted on the order. Minimum order amount and per-item limits apply.
- **Serviceability:** whether a pincode is served, and whether COD is available there, comes from the active carrier (pickup pincode, delivery pincode, weight, COD), cached in Redis. The manual carrier accepts every pincode. Order creation refuses unserviceable pincodes and COD where it isn't available.
- **Order creation** is one transaction: validate the cart, stock and address; calculate prices, shipping and COD fees; create the order and items; decrement stock; create the payment; clear the cart; write the first history entry. Never leave a partial order.
- **Stock changes** are atomic (a conditional update inside a transaction), never read, check, then write.
- **Cancellation:** allowed before `SHIPPED`. It restocks the items and refunds online payments.
- **Payments:** COD and ONLINE. Gateways implement `PaymentProvider` and are registered in the gateway registry. Provider fields stay generic (`provider`, `transactionId`, `providerOrderId`). Statuses: PENDING, PROCESSING, PAID, FAILED, REFUNDED.
- **Shipping** is separate from the order: Order → `Shipment` (one per order) → `ShipmentEvent`.
  - Carriers implement `ShippingProvider` in `modules/shipping` and are registered in the `CARRIERS` registry, the same way as payment gateways: `manual` (admin enters courier name, AWB and tracking URL), `mock` (outside production only), Shiprocket and Fship. Only one carrier is active at a time.
  - `Shipment` keeps generic provider fields: `provider`, `providerOrderId`, `providerShipmentId`, `awb`, `courierName`, `trackingUrl`, `labelUrl`.
  - Shipment statuses: PENDING, AWB_ASSIGNED, PICKUP_SCHEDULED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, NDR, RTO_IN_TRANSIT, RTO_DELIVERED, CANCELLED, LOST. Each carrier maps its own statuses to these.
  - Shipment status changes update the order status through one mapping, written to `OrderStatusHistory`.
  - Carrier webhooks verify their signature or token and are idempotent: a repeated event changes nothing.
- **Returns:** a customer requests a return per item within the return window from settings, with a reason and photos. An admin approves or rejects it; the reverse pickup goes through the carrier when it supports it, otherwise manually. On receipt the admin restocks (logged) and refunds through the `Refund` flow. For RTO shipments the admin confirms receipt, restocks, and refunds online payments.
- **Money:** `Decimal @db.Decimal(10, 2)` and Decimal arithmetic for subtotals, fees, discounts, totals and payment amounts. Never JavaScript floats.

## Authentication

- **Customers** sign in with phone OTP. OTPs live in Redis with a TTL (`otp:{phone}`); never store them in PostgreSQL.
- **Admins and staff** sign in to the dashboard with email and password (`POST /auth/login`) and cannot use OTP.
  - Passwords are scrypt hashes (`shared/password.ts`), and failed attempts are rate-limited per email and network.
  - Admins set and reset staff passwords in the dashboard. The first admin, and any admin password reset, uses the `create-admin` script.
- **SMS fallback:** in development, OTPs are written to the API log until an SMS provider is set up. In production, OTP sign-in is unavailable until an admin configures SMS. `OTP_PROVIDER` in the environment overrides the dashboard choice, for recovery.
- **Review login** (Settings → SMS sign-in), for app store and payment gateway reviewers and sales demos: one phone number signs in to a customer account with a fixed code and no SMS.
  - Off by default. The code is stored only as an HMAC. The number never applies to admin or staff accounts, and orders from it are flagged "Review account" (not when it is a test account, as on a demo).
  - Do not extend it to other roles or numbers.
- **Test accounts** (`User.isTestAccount`, set with the `test-account` script) are demo accounts for prospects. The flag is in the sign-in token: a test admin can only read, plus run the order fulfilment steps, and test staff and customers are limited.

## White-label

- **No shared-database multi-tenancy.** Each client has its own API, PostgreSQL, Redis, secrets, dashboard, website and app builds. No `tenantId`.
- **Branding and business settings** (name, logo, colors, currency, timezone, shipping fees, minimum order, return window, home sections) live in dashboard settings or env defaults, never in business logic.
- **Mobile builds:** each client has its own EAS project and Firebase project, build profiles in `apps/customer/eas.json` (name, package ID, scheme, API URL, EAS project) and a brand folder `apps/customer/brands/<brand>/` (icon, splash), read by `app.config.js`. See `docs/deployment.md`.
- **Secrets** are environment variables. The one exception: payment gateway keys (Razorpay, Cashfree, …), SMS provider keys (Message Central, …) and shipping carrier keys (Shiprocket, Fship, …) may also be entered in the dashboard.
  - They're stored AES-256-GCM encrypted with `SECRETS_ENCRYPTION_KEY` and are write-only: the API never returns them.
  - Keys set in the environment take priority.
  - Do not extend this to other secrets without an explicit decision.

## Images

Images are uploaded through the `uploads` module (`POST /images`), converted to WebP in two sizes (1200 px and 400 px), and stored on local disk (`UPLOADS_DIR`). In production Nginx serves `/uploads/` and the daily backup copies the files. Do not add object storage unless a client needs more than one server.

## Security

- Hash passwords. OTPs are short-lived.
- The JWT secret comes from the environment. Use Helmet and configure CORS. On the website the customer token is an httpOnly, secure cookie, never readable by browser scripts.
- Validate body, query, params and important config with Zod, and keep database constraints too.
- The server calculates all prices, fees and totals and checks stock and serviceability. Never trust client input.
- Payment and carrier webhooks verify their signature or token before changing anything.
- Never expose database credentials, payment or carrier secrets.
- Never commit `.env` files, secrets, keys or production credentials. Never reuse development credentials in production.

## Backend code

- Structure: route → handler → service → data access → Prisma. Combine layers in simple modules. No enterprise patterns, no queries scattered through handlers, no business logic in `server.ts`.
- Routes are resource-oriented and predictable (`GET /orders/:id`, `POST /orders/:id/cancel`).
- Paginate and limit lists, and avoid N+1 queries and huge payloads. Use indexes, transactions and Redis caching where useful. Don't optimize prematurely.

## Prisma 7.10.0

Never upgrade to Prisma 8 or use Prisma 8 APIs; the project hit a 7/8 mismatch before.

- **Files:** the schema is `apps/api/prisma/schema.prisma` and the config is `apps/api/prisma.config.ts`. The client is generated into `apps/api/src/generated/prisma` (generator `prisma-client`), and `DATABASE_URL` comes from the environment.
- **After a schema change,** from `apps/api`: `prisma format`, `prisma validate`, `prisma migrate dev --name <name>`, `prisma generate`, then `pnpm typecheck`. Commit migrations, and don't use `db push`.
- **When `migrate dev` refuses a non-interactive shell:** write the SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then run `prisma migrate deploy`.

## Environment

- **Machine:** Windows with WSL2, project at `/home/piyush/projects/shop-platform`. Docker Engine runs inside WSL; never suggest Docker Desktop. Node 24, pnpm 11.
- **Dev services** (`docker/docker-compose.yml`, Compose project `shop`): PostgreSQL 17 on host port 5434 and Redis 7 on host port 6380, so they run next to other projects' containers (5432 is taken by a Windows PostgreSQL). Database, user and password: `shop` / `shop` / `shop_dev`. These are for development only.
- **Production** (`deploy/`): one Compose stack per client.
  - It runs PostgreSQL, Redis, migrations, the API, the dashboard, the storefront (`apps/web` on `SITE_DOMAIN`), Nginx with Let's Encrypt, an uploads volume and daily backups.
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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
