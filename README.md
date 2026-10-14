# Shop Platform

A white-label single-vendor e-commerce platform, like a Shopify store: one seller per deployment, any kind of physical product. Customers buy on the storefront website or the customer app; admins and staff run the shop from a dashboard; orders ship through third-party carriers (Shiprocket, Fship, any courier, or manual self-ship), with online payment or cash on delivery. The same code is deployed separately for each client, with its own database, Redis, secrets and app builds.

> **Conversion in progress.** This codebase started as a quick-commerce grocery platform and is being converted in phases. Until that is finished, parts of the code (stores, store pricing, the store-run order flow) still follow the grocery model. `AGENTS.md` describes the target.

## What's in the repository

| App | Path | Stack | Used by |
| --- | --- | --- | --- |
| API | `apps/api` | Fastify, Prisma 7, PostgreSQL, Redis, Zod | All apps |
| Dashboard | `apps/admin` | Next.js 16, React, Tailwind CSS, shadcn/ui | Admins and staff |
| Storefront | `apps/web` | Next.js 16 | Customers, on the client's main domain |
| Customer app | `apps/customer` | Expo, React Native | Customers |

Other folders:

- `docker/`: PostgreSQL and Redis for local development.
- `deploy/`: the production stack (Docker Compose, Nginx, Let's Encrypt, daily backups).
- `packages/validation`: validation rules shared by the API and the dashboard (phone, money, SKU and code patterns, Indian states, GSTIN checks). Plain TypeScript with no dependencies, loaded as source (no build step).
- `AGENTS.md`: product scope, architecture and coding rules. Read it before making larger changes.
- `docs/deployment.md`: deploying a client's server and building their app.
- `TODO.md`: known gaps and planned work.

The API is a modular monolith. Each domain lives in `apps/api/src/modules/`.

## Requirements

- Node.js 24
- pnpm 11 (`corepack enable` picks up the version pinned in `package.json`)
- Docker Engine with Docker Compose (on Windows, run it inside WSL2)
- For the mobile app: Expo Go or a development build on a phone, and an [Expo](https://expo.dev) account for EAS builds

## Local development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start PostgreSQL (host port 5434) and Redis (host port 6380). The Compose project is named `shop`, so it runs next to other projects' containers:

   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

3. Create the environment files and fill them in:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/admin/.env.example apps/admin/.env
   cp apps/web/.env.example apps/web/.env
   cp apps/customer/.env.example apps/customer/.env
   ```

   In `apps/api/.env`, set `JWT_SECRET` to a long random string and `SECRETS_ENCRYPTION_KEY` to the output of `openssl rand -base64 32`. The defaults work for everything else.

4. Apply the database migrations and load the sample data:

   ```bash
   cd apps/api
   pnpm exec prisma migrate deploy
   pnpm db:seed
   cd ../..
   ```

   The seed is idempotent and creates an admin, staff, a customer, categories and products with stock.

5. Start the API (http://localhost:4000), the dashboard (http://localhost:3000) and the storefront (http://localhost:3001):

   ```bash
   pnpm dev
   ```

   Check the API with `curl localhost:4000/health`.

6. Start the customer app in another terminal and open it in Expo Go:

   ```bash
   pnpm --filter customer start
   ```

   Local Metro always talks to the API on the machine running Expo (port 4000), not the production URL in `eas.json`. If the phone can't reach it, set `EXPO_PUBLIC_DEV_API_URL` in the app's `.env` (LAN IP, `http://10.0.2.2:4000` on the Android emulator, or a tunnel).

### Sample accounts

| Who | Sign in with |
| --- | --- |
| Admin | `admin@shop.test`, password `shop-dev` |
| Staff | `staff@shop.test`, password `shop-dev` |
| Customer | `+919000000002` and an OTP |

In development, OTPs are written to the API log unless an SMS provider is configured. To be sure no real SMS goes out while testing, start the API with `OTP_PROVIDER=log`.

## Common commands

Run these from the repository root:

```bash
pnpm dev          # API, dashboard and storefront in watch mode
pnpm typecheck    # all apps
pnpm lint         # all apps
pnpm test         # API tests (needs the dev PostgreSQL and Redis running)
pnpm build        # all apps
```

For a single app, add a filter: `pnpm --filter @shop/api typecheck`, `pnpm --filter admin lint`, and so on.

### Tests

The API tests (`apps/api/test`, Vitest) call the API in-process, without a server. Each run creates its own database (`shop_test_<timestamp>`) on the dev PostgreSQL, applies the migrations and the seed, and drops it at the end; Redis database 15 is used and flushed. They never touch the dev database or `apps/api/.env`, and OTPs are only logged. Run one file with `pnpm --filter @shop/api test orders`, or watch with `pnpm --filter @shop/api test:watch`.

GitHub Actions (`.github/workflows/ci.yml`) runs the Prisma checks, typecheck, lint and tests on every push and pull request. It doesn't build images or deploy.

### Changing the database schema

The schema is `apps/api/prisma/schema.prisma`. After editing it, from `apps/api`:

```bash
pnpm exec prisma format
pnpm exec prisma validate
pnpm exec prisma migrate dev --name describe_the_change
pnpm exec prisma generate
pnpm typecheck
```

Commit the new folder under `prisma/migrations/`. Stay on Prisma 7; don't upgrade to Prisma 8.

## Sign-in

- **Customers** sign in with their phone number and an OTP sent by SMS. OTPs live only in Redis and expire after 5 minutes. Sends are rate-limited per phone and per network.
- **Admins and staff** sign in to the dashboard with email and password, and can't use OTP. Passwords are stored as scrypt hashes, and failed attempts are rate-limited. Admins set and reset staff passwords in the dashboard.
- **The first admin** of a deployment is created with a script, which asks for the password. Running it again resets that admin's password:

  ```bash
  # development
  pnpm --filter @shop/api admin:create --email you@example.com --phone +919876543210 --name "Your Name"
  # production (from deploy/)
  docker compose run --rm api node dist/scripts/create-admin.js --email you@example.com --phone +919876543210
  ```

## Payments, SMS and shipping

Admins configure providers in the dashboard under **Settings**:

- **Payments:** cash on delivery always works. For online payments, add Razorpay or Cashfree keys and choose the active gateway. Outside production, a test gateway that charges nothing is also available.
- **SMS (customer OTPs):** add Message Central keys and select it as the SMS provider.
- **Shipping:** choose the active carrier (manual self-ship, Shiprocket, Fship; a mock carrier outside production) and add its keys.

Keys saved in the dashboard are encrypted with `SECRETS_ENCRYPTION_KEY` and are never shown again. Keys set as environment variables take priority over them. `apps/api/.env.example` lists every setting.

## Images

Product, category, logo and banner images are uploaded in the dashboard. You can also paste a link to an image hosted elsewhere.

- **Processing:** the API (`POST /images`, admins and staff) converts each upload to WebP in two sizes, 1200 px and 400 px on the longest side. It also turns photos upright and removes their metadata. Uploads are limited to 10 MB in JPEG, PNG, WebP, AVIF or GIF.
- **Storage:** files go on the server's disk in `UPLOADS_DIR`, named by their content. Uploading the same file twice stores it once.
- **Serving:**
  - Production: Nginx serves `/uploads/` directly, with a one-year cache.
  - Development: the API serves it.
  - The apps load the 400 px version in lists and the full size on detail screens.
- **Backups:** the daily backup copies new images into `deploy/backups/uploads`.

No object storage is needed: a catalog of a few thousand products takes a few hundred MB.

## Production deployment

Each client gets its own server (or Compose project) running `deploy/compose.yml`, which contains:

- PostgreSQL and Redis, which aren't exposed to the internet;
- a one-off service that runs database migrations on every start;
- the API, the dashboard and the storefront;
- Nginx with Let's Encrypt certificates that renew automatically;
- a volume for uploaded images, served by Nginx;
- a daily `pg_dump` backup kept for 14 days, plus a copy of new images.

To update a server: `deploy/update.sh`. It pulls the code and builds the images on the server. Migrations run automatically.

**[docs/deployment.md](docs/deployment.md)** is the full runbook: setting up a new client, updating safely (pending migrations, backups), rollback and restore, and the launch checklist.

## Mobile app builds

The customer app is built with EAS. Each client gets their own EAS project and Firebase project, plus:

- a brand folder, `apps/customer/brands/<brand>/`, with the launcher icon, splash screen and their colours;
- build profiles in `apps/customer/eas.json`, such as `acme-preview` (an APK to install directly) and `acme-production` (Play Store), with the app name, package ID, link scheme, API URL and EAS project. Copy the `example-*` profiles.

```bash
cd apps/customer
npx eas build --profile acme-preview --platform android
```

When the EAS build quota is used up, build on your own machine with `--local`; setup and commands are in [docs/deployment.md](docs/deployment.md#5-building-locally-when-eas-cloud-builds-run-out).

Colours, logo and texts inside the app come from the client's dashboard at runtime, so they don't need a rebuild. Anything prefixed with `EXPO_PUBLIC_` is bundled into the app, so never put secrets there. Details are in [docs/deployment.md](docs/deployment.md#mobile-app-per-client).

## Security notes

- Never commit `.env`, `deploy/.env`, `deploy/api.env`, keys or production credentials. All of them are gitignored.
- Development credentials, such as the Docker database password and the seed passwords, are for local use only.
- The server calculates all prices, fees and totals, and checks stock and serviceability; client input is never trusted.
- Passwords are stored only as hashes; payment, SMS and carrier keys only encrypted.
