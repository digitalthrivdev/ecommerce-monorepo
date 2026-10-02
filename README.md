# Grocery Platform

A white-label quick-commerce grocery delivery platform: a customer app, a delivery partner app, an admin and store staff dashboard, and the API behind them. The same code is deployed separately for each client, with its own database, Redis, secrets and app builds.

## What's in the repository

| App | Path | Stack | Used by |
| --- | --- | --- | --- |
| API | `apps/api` | Fastify, Prisma 7, PostgreSQL, Redis, Zod | All apps |
| Dashboard | `apps/admin` | Next.js 16, React, Tailwind CSS, shadcn/ui | Admins and store staff |
| Customer app | `apps/customer` | Expo, React Native | Customers |
| Delivery app | `apps/delivery` | Expo, React Native | Delivery partners |

Other folders:

- `docker/`: PostgreSQL and Redis for local development.
- `deploy/`: the production stack (Docker Compose, Nginx, Let's Encrypt, daily backups).
- `packages/`: reserved for shared code; currently empty.
- `AGENTS.md`: product scope, architecture and coding rules. Read it before making larger changes.
- `TODO.md`: known gaps and planned work.

The API is a modular monolith. Each domain lives in `apps/api/src/modules/` (auth, users, stores, categories, products, inventory, cart, orders, payments, delivery, notifications, settings).

## Features

- **Customers:** phone OTP sign-in, addresses, nearest serviceable store, catalog and search, cart, checkout with cash on delivery or online payment, live order tracking, order history and cancellation.
- **Store staff:** incoming orders, accept, pick, mark items unavailable, pack, ready for pickup, inventory adjustments.
- **Admins:** stores, categories, products, store pricing, inventory, orders, customers, delivery partners and assignment, refunds, delivery charges, branding and platform settings, payment and SMS provider keys.
- **Delivery partners:** online/offline status, assigned deliveries, pickup, navigation, delivery OTP, history and earnings.

Order lifecycle: `PENDING_PAYMENT → CONFIRMED → STORE_ACCEPTED → PICKING → PACKED → READY_FOR_PICKUP → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED`, with cancellation where the rules allow it.

## Requirements

- Node.js 24
- pnpm 11 (`corepack enable` picks up the version pinned in `package.json`)
- Docker Engine with Docker Compose (on Windows, run it inside WSL2)
- For the mobile apps: Expo Go or a development build on a phone, and an [Expo](https://expo.dev) account for EAS builds

## Local development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start PostgreSQL (host port 5433) and Redis (port 6379):

   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

3. Create the environment files and fill them in:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/admin/.env.example apps/admin/.env
   cp apps/customer/.env.example apps/customer/.env
   cp apps/delivery/.env.example apps/delivery/.env
   ```

   In `apps/api/.env`, set `JWT_SECRET` to a long random string and `SECRETS_ENCRYPTION_KEY` to the output of `openssl rand -base64 32`. The defaults work for everything else.

4. Apply the database migrations and load the sample data:

   ```bash
   cd apps/api
   pnpm exec prisma migrate deploy
   pnpm db:seed
   cd ../..
   ```

   The seed is idempotent and creates an admin, a customer, a store with staff, a delivery partner, 7 categories and 30 products with stock.

5. Start the API (http://localhost:4000) and the dashboard (http://localhost:3000):

   ```bash
   pnpm dev
   ```

   Check the API with `curl localhost:4000/health`.

6. Start a mobile app in another terminal and open it in Expo Go:

   ```bash
   pnpm --filter customer start
   pnpm --filter delivery start
   ```

   If the phone can't reach the API, set `EXPO_PUBLIC_API_URL` in the app's `.env` to your computer's LAN address, for example `http://192.168.1.10:4000`.

### Sample accounts

| Who | Sign in with |
| --- | --- |
| Admin | `admin@grocery.test`, password `grocery-dev` |
| Store staff | `staff@grocery.test`, password `grocery-dev` |
| Customer | `+919000000002` and an OTP |
| Delivery partner | `+919000000004` and an OTP |

In development, OTPs are written to the API log unless an SMS provider is configured. To be sure no real SMS goes out while testing, start the API with `OTP_PROVIDER=log`.

## Common commands

Run these from the repository root:

```bash
pnpm dev          # API and dashboard in watch mode
pnpm typecheck    # all apps
pnpm lint         # all apps
pnpm build        # all apps
```

For a single app, add a filter: `pnpm --filter @grocery/api typecheck`, `pnpm --filter admin lint`, and so on.

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

- **Customers and delivery partners** sign in with their phone number and an OTP sent by SMS. OTPs live only in Redis and expire after 5 minutes. Sends are rate-limited per phone and per network.
- **Admins and store staff** sign in to the dashboard with email and password, and can't use OTP. Passwords are stored as scrypt hashes, and failed attempts are rate-limited. Admins set and reset staff passwords on the store page.
- **The first admin** of a deployment is created with a script, which asks for the password. Running it again resets that admin's password:

  ```bash
  # development
  pnpm --filter @grocery/api admin:create --email you@example.com --phone +919876543210 --name "Your Name"
  # production (from deploy/)
  docker compose run --rm api node dist/scripts/create-admin.js --email you@example.com --phone +919876543210
  ```

## Payments and SMS

Admins configure providers in the dashboard under **Settings**:

- **Payments:** cash on delivery always works. For online payments, add Razorpay or Cashfree keys and choose the active gateway. Outside production, a test gateway that charges nothing is also available.
- **SMS (customer and delivery partner OTPs):** add Message Central keys and select it as the SMS provider.

Keys saved in the dashboard are encrypted with `SECRETS_ENCRYPTION_KEY` and are never shown again. Keys set as environment variables take priority over them. `apps/api/.env.example` lists every setting.

## Production deployment

Each client gets its own server (or Compose project) running `deploy/compose.yml`, which contains:

- PostgreSQL and Redis, which aren't exposed to the internet;
- a one-off service that runs database migrations on every start;
- the API and the dashboard;
- Nginx with Let's Encrypt certificates that renew automatically;
- a daily `pg_dump` backup kept for 14 days.

Setup, in short:

1. Point an API domain and a dashboard domain at the server, and open ports 80 and 443.
2. Clone the repository on the server, then in `deploy/`: `cp .env.example .env && cp api.env.example api.env`, and fill both in with freshly generated secrets.
3. Run `./init-letsencrypt.sh` to get the certificate and start the stack.
4. Create the first admin with the script above.

To update: `git pull && docker compose up -d --build` in `deploy/`. Migrations run automatically.

The full steps, plus backup and restore, are in `deploy/.env.example` and `deploy/backup.sh`.

## Mobile app builds

Both Expo apps have EAS profiles in their `eas.json`:

- `development`: a dev client that loads code from your computer;
- `preview`: a standalone APK to install directly on a phone;
- `production`: the Play Store build.

Each profile reads the EAS environment of the same name.

Per-client settings are environment variables, read by each app's `app.config.js`. Set them per EAS environment with `eas env:create`, or in `.env` for local runs:

| Variable | Example | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `https://api.example.com` | The client's API |
| `APP_NAME` | `Moozy` | Name under the launcher icon |
| `APP_ID` | `in.moozy.app` | Android package and iOS bundle ID; permanent once published |
| `APP_SCHEME` | `moozy` | Deep link used to return from online payment |
| `GOOGLE_SERVICES_JSON` | file variable | Firebase config for `APP_ID`, needed for Android push |
| `EAS_PROJECT_ID`, `EXPO_OWNER`, `APP_SLUG` | | The client's own EAS project, if they have one |

Colors, logo and the app name shown inside the app come from the dashboard settings at runtime, so they don't need a rebuild.

```bash
cd apps/customer
npx eas build --profile preview --platform android
```

Anything prefixed with `EXPO_PUBLIC_` is bundled into the app, so never put secrets there. Firebase files (`google-services.json`, `GoogleService-Info.plist`) are gitignored and must be provided per client. If the Firebase file has no app for `APP_ID`, the build still works, but without push notifications.

## Security notes

- Never commit `.env`, `deploy/.env`, `deploy/api.env`, keys or production credentials. All of them are gitignored.
- Development credentials, such as the Docker database password and the seed passwords, are for local use only.
- The server calculates all prices and totals, and checks stock, store and serviceability; client input is never trusted.
- Delivery OTPs and passwords are stored only as hashes.
