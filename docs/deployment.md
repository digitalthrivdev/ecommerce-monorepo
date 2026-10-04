# Deployment runbook

How to run the platform for a client: their server, their dashboard and their mobile apps. Follow it step by step; most of the rules below exist because skipping them breaks a live client.

## What each client gets

The platform is white-label. Every client is a separate deployment of the same code:

| Part | Per client | Where it is configured |
| --- | --- | --- |
| Server (API, dashboard, PostgreSQL, Redis, Nginx, backups) | Own VPS | `deploy/.env`, `deploy/api.env` on that server |
| Secrets (database password, JWT, encryption key) | Freshly generated | `deploy/.env`, `deploy/api.env` (never in git) |
| Payment and SMS keys | Client's own accounts | Dashboard → Settings (encrypted), or `deploy/api.env` |
| Branding, colours, fees, home screen | | Dashboard → Appearance and Settings (no rebuild) |
| App name, package ID, link scheme, API URL | | Build profiles in `apps/*/eas.json` |
| Launcher icon, splash screen | | `apps/*/brands/<brand>/` |

There is no shared database and no `tenantId`. Never point one client's app at another client's API, and never copy secrets between clients.

## Current clients

| Client | Server | Stack folder | Domains | App build profiles | Package IDs |
| --- | --- | --- | --- | --- | --- |
| Moozy (test client on our own domain) | `ssh grocery-vps` | `~/moozy/deploy` | `api.moozy.in`, `admin.moozy.in` | `moozy-preview`, `moozy-production` (brand folder `moozy`) | `in.moozy.app`, `in.moozy.partner` |

Add a row for every new client.

## New client: server

Needs a VPS with Docker Engine and Docker Compose, at least 2 GB RAM (or swap), since the dashboard image build needs about 1.5 GB. Run one client per VPS: every stack's Nginx binds ports 80 and 443, so two stacks on one server would need an extra proxy in front, which isn't set up.

1. **DNS:** point the API and dashboard domains (A records) at the server. Open ports 80 and 443.
2. **Code:** `git clone git@github.com:piyushGupta20/grocery-app-monorepo.git <client>` then `cd <client>/deploy && cp .env.example .env && cp api.env.example api.env`.
3. **Settings:** fill in both files. Generate every secret on the server, new for this client:
   - `POSTGRES_PASSWORD`: `openssl rand -hex 24` (letters and digits only).
   - `JWT_SECRET`: `openssl rand -base64 48`.
   - `SECRETS_ENCRYPTION_KEY`: `openssl rand -base64 32`. Changing it later means re-entering the payment and SMS keys.
   - `COMPOSE_PROJECT_NAME`: the client's name.
   - Starting branding and fees: `APP_NAME`, quoted colours, `TIMEZONE`, `CURRENCY`, delivery fees.
   - `PUSH_PROVIDER=expo` for push notifications, or `none`.
4. **Certificate:** dry run with `STAGING=1 ./init-letsencrypt.sh`, then `./init-letsencrypt.sh` for the real certificate. This starts the stack; renewal is automatic.
5. **First admin:** `docker compose run --rm api node dist/scripts/create-admin.js --email … --phone … --name "…"`. It asks for the password; running it again resets the password.
6. **Check:** `docker compose ps` (all healthy) and `curl https://API_DOMAIN/health`.
7. **Dashboard:** sign in at `https://ADMIN_DOMAIN`, then:
   - Settings: SMS provider keys (customers can't sign in without them) and payment gateway keys;
   - Appearance: name, logo, colours, home screen;
   - stores (location, radius, hours), categories, products, store prices and stock, delivery partners.
8. Add the client to the table above, then build their apps (below).

## Updating a server

Push to GitHub first; the server pulls from there.

1. **What's deployed now:** `ssh <server> 'cd ~/<client> && git log -1 --oneline'`.
2. **Pending migrations:** from the repository, `git diff --name-only <deployed>..origin/main -- apps/api/prisma/migrations`. Read each new `migration.sql`. Migrations that only add tables or columns are safe. If one moves data, drops a column or adds `NOT NULL`, check it against the live data and take a backup first.
3. **Backup:** `docker compose exec backup sh /usr/local/bin/backup.sh` (in `deploy/`).
4. **Deploy:** `cd ~/<client> && git pull && cd deploy && docker compose up -d --build`. The `migrate` service applies migrations before the API starts. On a 1-CPU server the build takes about 5 minutes.
5. **Verify:** `docker compose ps` (api and admin healthy), `curl https://API_DOMAIN/health`, and `docker compose logs --tail 50 api` if anything is off.

With several clients, update every server before releasing new app builds: a new app may call endpoints an older server doesn't have.

## Rollback and restore

- **Code only (no new migrations):** `git checkout <previous commit>` in the client folder, then `docker compose up -d --build`. Return with `git checkout main && git pull`.
- **After migrations:** Prisma migrations don't roll back. Restore the backup taken before the update, using the steps at the top of `deploy/backup.sh` (stop api and admin, `pg_restore`, copy images, start again), then deploy the old code.

Backups are daily dumps in `deploy/backups`, kept `BACKUP_KEEP_DAYS` days, plus copies of uploaded images. They stay on the same server; copying them elsewhere is still on `TODO.md`.

## Mobile apps per client

`apps/customer` (customers) and `apps/delivery` (delivery partners) are built with EAS under the Expo account `folimah235`. One EAS project per app serves every client. Each client gets a brand folder and build profiles; `app.config.js` reads them.

### 1. Brand folder

`apps/customer/brands/<brand>/` and `apps/delivery/brands/<brand>/` (each app can have its own icon). Every file is optional; missing ones fall back to `assets/`:

All images must be PNG, exactly square, 1024×1024 px.

| File | What it is | Requirements |
| --- | --- | --- |
| `icon.png` | Icon on iOS and older Android | Full logo on its background, filling the square; no transparency, no rounded corners (the system rounds them) |
| `android-icon-foreground.png` | Android launcher icon, front layer | Logo only, transparent around it, inside a centred circle about 620 px wide; launchers crop everything outside to a circle, squircle or rounded square |
| `android-icon-background.png` | Android launcher icon, back layer | Full square, no transparency. Optional: for a plain colour, leave it out and set `iconBackgroundColor` |
| `android-icon-monochrome.png` | Android 13+ themed icon and the notification icon | Pure white silhouette of the logo on transparent, same 620 px circle, no text or fine detail |
| `splash-icon.png` | Logo in the middle of the splash screen | Transparent background, logo centred with some padding. It's shown 160 dp wide on the splash colour, so it must read on both the light and dark colours |
| `brand.json` | Colours | Any of `iconBackgroundColor`, `splashBackgroundColor`, `splashDarkBackgroundColor`, `notificationColor`, as `"#RRGGBB"` |

```json
{ "iconBackgroundColor": "#0C831F", "splashBackgroundColor": "#FFFFFF", "splashDarkBackgroundColor": "#0F1012", "notificationColor": "#0C831F" }
```

A misspelled `APP_BRAND`, an unknown key or a bad colour stops the build with an error. Check icons and the splash on a preview build; Expo Go and development builds show their own splash screen.

### Images uploaded in the dashboard

These change without a rebuild. Uploads accept JPEG, PNG, WebP, AVIF and GIF up to 10 MB, and are converted to WebP at 1200 px and 400 px on the longest side, so larger than 1200 px gains nothing.

| Image | Where | Shape | Size |
| --- | --- | --- | --- |
| Logo | Appearance → Branding | Square, transparent PNG | 512×512 or more; shown 22–72 dp, so keep it simple |
| Banner | Banner carousel section | 2:1 | 1200×600; keep text away from the edges (rounded corners) |
| Image tile, grid layout | Image tiles section | 1:1 | 800×800 to 1200×1200 |
| Image tile, carousel layout | Image tiles section | 4:5 | 960×1200 |
| Offer strip icon | Offer strip section | Square, transparent | 400×400; shown 56 dp |
| Category image, collection tile | Categories, category collection section | 1:1 | 800×800; product on a plain background |
| Tab page header image | Category tabs → own page | Wide, cropped to fill the header | 1200×700; keep the important part in the middle. GIF animates |
| Product photos | Products | 1:1 | 1200×1200, product centred on white or a plain background |

### Play Store listing (per app)

| Asset | Requirements |
| --- | --- |
| App icon | 512×512 PNG, up to 1 MB |
| Feature graphic | 1024×500 JPG or PNG, no transparency |
| Phone screenshots | 2 to 8, for example 1080×1920 |
| Short and full description | Up to 80 and 4000 characters |
| Privacy policy | A public URL |

The delivery app can skip the Play Store and be shared as a preview APK.

### 2. Build profiles

Add `<brand>-preview` and `<brand>-production` to both `eas.json` files:

```json
"acme-preview": {
  "extends": "preview",
  "env": {
    "APP_BRAND": "acme",
    "APP_NAME": "Acme Grocery",
    "APP_ID": "com.acme.grocery",
    "APP_SCHEME": "acme",
    "EXPO_PUBLIC_API_URL": "https://api.acme.com"
  }
},
"acme-production": {
  "extends": "production",
  "env": { "APP_BRAND": "acme", "APP_NAME": "Acme Grocery", "APP_ID": "com.acme.grocery", "APP_SCHEME": "acme", "EXPO_PUBLIC_API_URL": "https://api.acme.com" }
}
```

- **`APP_ID`** is the Android package and iOS bundle ID. It's permanent once the app is on a store, and must differ between clients and between the two apps (e.g. `com.acme.grocery` and `com.acme.partner`).
- **`APP_SCHEME`** brings the customer back from the payment page; use a unique one per client.
- **Values here are public.** They are bundled into the app, so they are safe to commit. Never put a secret in `eas.json` or in any `EXPO_PUBLIC_` variable.
- **Optional:** `EAS_PROJECT_ID`, `EXPO_OWNER` and `APP_SLUG` move a client to their own EAS project.

### 3. EAS environments: shared values only

The EAS environments (`preview`, `production`) are shared by every client, so they hold only what is the same for all: `GOOGLE_SERVICES_JSON`. Each app has one Firebase project (customer: `grocery-customer-be73d`, delivery: `grocery-delivery-f1e4e`). For a new client:

1. In that Firebase project, add an Android app with the client's package ID.
2. Download `google-services.json` again (it now lists every client) and replace the `GOOGLE_SERVICES_JSON` file variable in both EAS environments.
3. Upload the project's FCM V1 service account key for the new package: `npx eas-cli@latest credentials` → Android → the package → Push Notifications (FCM V1).

Without a matching Firebase entry the build still works, but without push notifications (the build log warns about it).

Don't set `APP_NAME`, `APP_ID`, `APP_SCHEME`, `APP_BRAND` or `EXPO_PUBLIC_API_URL` in an EAS environment: they would leak into the builds of clients whose profiles don't set them. When a name is in both, the build profile wins (`eas config --profile <profile>` shows which values are used). Check with `npx eas-cli@latest env:list preview` (and `production`) in each app folder.

### 4. Build and publish

```bash
cd apps/customer   # or apps/delivery
npx eas build --profile acme-preview --platform android --no-wait      # APK to install directly
npx eas build --profile acme-production --platform android --no-wait   # Play Store bundle
npx eas submit --platform android --id <build id>                       # upload to Play Console
```

- **Always submit by build ID.** `--latest` takes the newest build of the EAS project, which may belong to another client.
- **Check before building:** `APP_BRAND=acme APP_NAME="Acme Grocery" npx expo config --type public` shows the resolved name, icon and splash.
- **Signing keys:** EAS creates a separate key for each package ID on its first build and keeps it. Never delete EAS credentials: without the key, the Play Store app can't be updated.
- **Play Store:** the client should own the Play Console account, so their name shows as the developer.
- **iOS:** needs an Apple Developer account; use the same commands with `--platform ios`.

Colours, logo, banners and texts inside the app come from the client's dashboard at runtime, so they change without a rebuild. A rebuild is needed only for the values in the build profile and the brand folder.

## Launch checklist (per client)

- [ ] `/health` is `ok` and the certificate is valid.
- [ ] SMS keys are set, and a real phone receives an OTP and signs in.
- [ ] Online payments: sandbox payment, failed payment and refund tested, with webhooks registered. Otherwise offer cash on delivery only.
- [ ] A store with location, radius and hours; products with prices and stock.
- [ ] A delivery partner account signs in on the delivery app.
- [ ] One full order end to end: place, accept, pack, assign, pick up, deliver with OTP. A push notification arrives.
- [ ] Backups appear in `deploy/backups`; the client knows they also need an off-site copy.
