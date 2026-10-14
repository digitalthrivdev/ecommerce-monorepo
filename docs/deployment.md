# Deployment runbook

How to run the platform for a client: their server, their dashboard, their storefront website and their customer app. Follow it step by step; most of the rules below exist because skipping them breaks a live client.

## What each client gets

The platform is white-label. Every client is a separate deployment of the same code:

| Part | Per client | Where it is configured |
| --- | --- | --- |
| Server (API, dashboard, storefront website, PostgreSQL, Redis, Nginx, backups) | Own VPS | `deploy/.env`, `deploy/api.env` on that server |
| Storefront (`apps/web`) | Client's main domain | Dashboard → Settings → Website; the home page comes from Appearance |
| Secrets (database password, JWT, encryption key) | Freshly generated | `deploy/.env`, `deploy/api.env` (never in git) |
| Payment, SMS and shipping carrier keys | Client's own accounts | Dashboard → Settings (encrypted), or `deploy/api.env` |
| Branding, colours, fees, home screen | | Dashboard → Appearance and Settings (no rebuild) |
| EAS project (app builds, signing keys) | Own project | `EAS_PROJECT_ID`, `EXPO_OWNER` in the build profiles |
| Firebase project (Android push) | Own project | The client's EAS environment (`GOOGLE_SERVICES_JSON`) |
| App name, package ID, link scheme, API URL | | Build profiles in `apps/customer/eas.json` |
| Launcher icon, splash screen | | `apps/customer/brands/<brand>/` |
| Error tracking (Sentry project) | One project per client | `SENTRY_DSN` in `deploy/.env`; `EXPO_PUBLIC_SENTRY_DSN` in the build profiles |

There is no shared database and no `tenantId`. Never point one client's app or website at another client's API, and never copy secrets, EAS projects, Firebase projects or carrier and payment accounts between clients.

## Current clients

| Client | Server (SSH host) | Stack folder | Domains | App build profiles | Package ID |
| --- | --- | --- | --- | --- | --- |
| (none yet) | | | | | |

Add a row for every new client.

## New client: server

Needs a VPS with Docker Engine and Docker Compose, at least 2 GB RAM plus 2 GB swap: the dashboard and website images each need about 1.5 GB while building, and Compose builds them together. Run one client per VPS: every stack's Nginx binds ports 80 and 443, so two stacks on one server need a proxy in front (see "Servers running Coolify").

1. **DNS:** point the API and dashboard domains, the client's main domain (`SITE_DOMAIN`, the storefront) and its `www` (A records) at the server. Open ports 80 and 443.
2. **Code:** `git clone <repository URL> <client>` then `cd <client>/deploy && cp .env.example .env && cp api.env.example api.env`.
3. **Settings:** fill in both files. Generate every secret on the server, new for this client:
   - `POSTGRES_PASSWORD`: `openssl rand -hex 24` (letters and digits only).
   - `JWT_SECRET`: `openssl rand -base64 48`.
   - `SECRETS_ENCRYPTION_KEY`: `openssl rand -base64 32`. Changing it later means re-entering the payment, SMS and carrier keys.
   - `COMPOSE_PROJECT_NAME`: the client's name.
   - Starting branding and fees: `APP_NAME`, quoted colours, `TIMEZONE`, `CURRENCY`, shipping fees.
   - `PUSH_PROVIDER=expo` for push notifications, or `none`.
   - `SENTRY_DSN`: the client's Sentry project (see "Error tracking and uptime"), or blank.
4. **Certificate:** dry run with `STAGING=1 ./init-letsencrypt.sh`, then `./init-letsencrypt.sh` for the real certificate. This builds and starts the stack; renewal is automatic.
5. **First admin:** `docker compose run --rm api node dist/scripts/create-admin.js --email … --phone … --name "…"`. It asks for the password; running it again resets the password. To change an admin's phone number only, run it with the new `--phone` and `--keep-password`.
6. **Check:** `docker compose ps` (all healthy) and `curl https://API_DOMAIN/health`.
7. **Dashboard:** sign in at `https://ADMIN_DOMAIN`, then:
   - Settings: SMS provider keys (customers can't sign in without them) and payment gateway keys;
   - Settings → Shipping: the pickup location (the address couriers collect from), the active carrier and its keys (see "Shipping carriers"), shipping fees and the return window;
   - Settings → Website: business name and address, then read and adjust each policy page. Add the customer app's store links once it is published;
   - Appearance: name, logo, colours, home screen;
   - categories, brands, products with variants, prices, stock, weights and dimensions. A whole catalog can be loaded from a CSV (Products → Import CSV; download the template there).
8. **Monitoring:** add the client's uptime monitors (see "Error tracking and uptime").
9. Add the client to the table above, then build their app (below).

### Servers running Coolify

When Coolify (its Traefik proxy, on the Docker network `coolify`) already uses ports 80 and 443, Traefik handles HTTPS instead of our certbot, and the stack's Nginx serves plain HTTP behind it with no published ports. Everything else (updates, backups) works the same.

- In `deploy/.env` add `COMPOSE_FILE=compose.yml:compose.coolify.yml`. This loads `deploy/compose.coolify.yml` and the Nginx template in `deploy/nginx/behind-proxy/`.
- Skip step 4: start with `docker compose up -d --build`. Traefik requests the certificate (one for all four domains) once DNS points at the server, so set up DNS first. `LETSENCRYPT_EMAIL` is unused.
- `COMPOSE_PROJECT_NAME` must be unique on the server: it names the Traefik routers and Nginx finds the containers by it.
- Nothing is added in Coolify's dashboard; the stack does not appear there.
- Never touch Coolify, Traefik or other people's containers on a shared server.
- Moving to a server without Coolify: remove the `COMPOSE_FILE` line, then run `./init-letsencrypt.sh`.

## Shipping carriers

Admins choose the active carrier under Settings → Shipping. Keys entered there are encrypted with `SECRETS_ENCRYPTION_KEY` and never shown again; keys in `deploy/api.env` take priority.

- **Manual:** no keys. The admin books the courier themselves and types the courier name, AWB and tracking URL on the order. Every pincode counts as serviceable.
- **Mock:** outside production only, for testing the whole flow without a carrier account.
- **Shiprocket** and **Fship:** setup steps (API user, webhook URL and token, pickup location name) are added here when each carrier is implemented.

Before launch, create one real test shipment with the client's carrier account, print its label, and cancel it, so the pickup address, package dimensions and webhooks are known to work.

## Updating a server

Push to GitHub first; the server pulls from there. There are no automatic deploys: CI (`.github/workflows/ci.yml`) only runs the Prisma checks, typecheck, lint and tests.

1. **What's deployed now:** `ssh <server> 'cd ~/<client> && git log -1 --oneline'`.
2. **Pending migrations:** from the repository, `git diff --name-only <deployed>..origin/main -- apps/api/prisma/migrations`. Read each new `migration.sql`. Migrations that only add tables or columns are safe. If one moves data, drops a column or adds `NOT NULL`, check it against the live data and take a backup first.
3. **Backup:** `docker compose exec backup sh /usr/local/bin/backup.sh` (in `deploy/`).
4. **Deploy:** `~/<client>/deploy/update.sh`. It pulls the code and builds the images on the server (about 5 minutes on 1 CPU). The `migrate` service applies migrations before the API starts.
5. **Verify:** `docker compose ps` (api, admin and web healthy), `curl https://API_DOMAIN/health`, and `docker compose logs --tail 50 api` if anything is off.

`update.sh` also re-renders and reloads Nginx, which keeps running across updates, so changes to `deploy/nginx/templates/` apply too. After a plain `docker compose up -d` instead, do it by hand: `docker compose exec nginx sh -c "/docker-entrypoint.d/20-envsubst-on-templates.sh && nginx -t && nginx -s reload"`.

With several clients, update every server before releasing new app builds: a new app may call endpoints an older server doesn't have.

## Rollback and restore

- **Code only (no new migrations):** `git checkout <previous commit>` in the client folder, then `docker compose up -d --build` in `deploy/`. Return with `git checkout main && deploy/update.sh`.
- **After migrations:** Prisma migrations don't roll back. Restore the backup taken before the update, using the steps at the top of `deploy/backup.sh` (stop api and admin, `pg_restore`, copy images, start again), then deploy the old code.

Backups are daily dumps in `deploy/backups`, kept `BACKUP_KEEP_DAYS` days, plus copies of uploaded images. They stay on the same server; copying them elsewhere is still on `TODO.md`.

## Error tracking and uptime

**Errors: Sentry.** One Sentry organisation for all clients, on the free Developer plan (one user, about 5,000 errors a month shared by every project). Create one project per client (platform: Node.js) and use its DSN for all four parts; reports are tagged `app` (`api`, `admin`, `web`, `customer`).

- Server: `SENTRY_DSN=<dsn>` in `deploy/.env`, then `docker compose up -d` (no rebuild). Compose passes it to the API, dashboard and website.
- App: `"EXPO_PUBLIC_SENTRY_DSN": "<dsn>"` in the client's build profiles, then rebuild. The DSN is not a secret (it only allows sending reports), so it is fine in `eas.json`.
- Blank turns reporting off. Development builds and Metro never report.

What is reported: everything the API logs at error level (500s, failed payment sweeps and refunds, SMS, push and carrier failures, crashes), server errors in the dashboard and website, browser errors in the dashboard, and JavaScript and native crashes in the app. Not reported: 4xx responses, browser errors on the website, performance data.

Personal data stays out: no request bodies, headers, cookies, query strings, console output or user IDs; phone numbers and email addresses in error messages are replaced. Each server process sends at most 60 reports an hour, each dashboard browser tab and each phone at most 10, so one broken client can't use up the shared quota. Also leave Sentry's spike protection on, and set a rate limit per DSN if the plan offers it (Project → Settings → Client Keys → Configure).

**Readable app stack traces.** Builds upload their source maps to Sentry when these are set; without them the build still works, but app stack traces are minified (the message, screen and device still show).

- In the client's EAS project environments (`preview` and `production`): `SENTRY_AUTH_TOKEN` (an organisation auth token from Sentry → Settings → Auth Tokens, visibility `secret`), `SENTRY_ORG` (the organisation slug) and, for an EU organisation, `SENTRY_URL=https://de.sentry.io/`. EAS environments belong to one EAS project, so set them for each client's project.
  ```bash
  cd apps/customer
  npx eas-cli@latest env:set --name SENTRY_AUTH_TOKEN --environment preview --environment production --visibility secret
  npx eas-cli@latest env:set --name SENTRY_ORG --value <org slug> --environment preview --environment production --visibility plaintext
  npx eas-cli@latest env:set --name SENTRY_URL --value https://de.sentry.io/ --environment preview --environment production --visibility plaintext
  ```
  Without `--value` the CLI asks for the token, so it stays out of the shell history. The CLI acts on the EAS project of the resolved app config, so run it with the client's `EAS_PROJECT_ID` and `EXPO_OWNER` set (see "Mobile app per client").
- Per client, in its build profiles next to the DSN: `"SENTRY_PROJECT": "<project slug>"`.
- `APP_BRAND=acme SENTRY_PROJECT=x SENTRY_AUTH_TOKEN=x SENTRY_ORG=y npx expo config --type public` shows the `@sentry/react-native/expo` plugin when everything is set.

To move to GlitchTip later (hosted or self-hosted, Sentry-compatible): create the projects there and swap the DSNs. No code changes.

**Uptime: UptimeRobot.** The free plan has 50 monitors with 5-minute checks and allows commercial use. Per client, add:

- a **Keyword** monitor on `https://API_DOMAIN/health`, alerting when the keyword `"redis":"ok"` is missing (the page fails without the database, and says `error` when Redis is down);
- an **HTTP(s)** monitor on `https://ADMIN_DOMAIN/login`;
- an **HTTP(s)** monitor on `https://SITE_DOMAIN` (the storefront takes orders, so it matters as much as the API).

Send alerts to your email and the UptimeRobot phone app. Name monitors `<client> API` etc. so alerts say which client is down.

## Mobile app per client

`apps/customer` is built with EAS. Each client gets their own EAS project and Firebase project, a brand folder and build profiles; `app.config.js` reads them. `app.json` holds no EAS project, owner or real package ID, and `eas.json` has an `example-preview` / `example-production` pair (brand folder `example`) to copy.

### 0. EAS and Firebase projects (once per client)

Nothing from the original grocery platform's EAS account or Firebase projects is reused.

1. **EAS project:** in the Expo account that will own the builds (ideally the client's, or an organisation you manage for them), create a project, e.g. `npx eas-cli@latest project:create` or on expo.dev. Put its ID and the account name in the client's build profiles as `EAS_PROJECT_ID` and `EXPO_OWNER`. EAS keeps the app's signing key in this project; never delete EAS credentials.
2. **Firebase project:** create one for the client, add an Android app with the client's package ID (`APP_ID`), and download `google-services.json`. Store it as the `GOOGLE_SERVICES_JSON` file variable in the client's EAS project environments (`preview`, `production`), and upload the project's FCM V1 service account key: `npx eas-cli@latest credentials` → Android → the package → Push Notifications (FCM V1).

Without a matching Firebase entry the build still works, but without push notifications (the build log warns about it).

### 1. Brand folder

`apps/customer/brands/<brand>/`. Every file is optional; missing ones fall back to `assets/`:

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

### Play Store listing

| Asset | Requirements |
| --- | --- |
| App icon | 512×512 PNG, up to 1 MB |
| Feature graphic | 1024×500 JPG or PNG, no transparency |
| Phone screenshots | 2 to 8, for example 1080×1920 |
| Short and full description | Up to 80 and 4000 characters |
| Privacy policy | `https://<SITE_DOMAIN>/privacy` |
| App access (sign-in for reviewers) | Turn on Settings → SMS sign-in → Review login and give its phone number and code |

### 2. Build profiles

Add `<brand>-preview` and `<brand>-production` to `apps/customer/eas.json`, copying the `example-*` pair:

```json
"acme-preview": {
  "extends": "preview",
  "env": {
    "APP_BRAND": "acme",
    "APP_NAME": "Acme Store",
    "APP_ID": "com.acme.store",
    "APP_SCHEME": "acme",
    "SITE_DOMAIN": "acme.com",
    "EXPO_PUBLIC_API_URL": "https://api.acme.com",
    "EAS_PROJECT_ID": "<the client's EAS project ID>",
    "EXPO_OWNER": "<the Expo account that owns it>",
    "EXPO_PUBLIC_SENTRY_DSN": "https://<key>@<org>.ingest.sentry.io/<project>",
    "SENTRY_PROJECT": "<sentry project slug>"
  }
},
"acme-production": {
  "extends": "production",
  "env": { "APP_BRAND": "acme", "APP_NAME": "Acme Store", "APP_ID": "com.acme.store", "APP_SCHEME": "acme", "SITE_DOMAIN": "acme.com", "EXPO_PUBLIC_API_URL": "https://api.acme.com", "EAS_PROJECT_ID": "<…>", "EXPO_OWNER": "<…>", "EXPO_PUBLIC_SENTRY_DSN": "https://<key>@<org>.ingest.sentry.io/<project>", "SENTRY_PROJECT": "<…>" }
}
```

- **`APP_ID`** is the Android package and iOS bundle ID. It's permanent once the app is on a store, and must differ between clients.
- **`APP_SCHEME`** brings the customer back from the payment page; use a unique one per client.
- **`SITE_DOMAIN`** is the client's website, the same as in `deploy/.env`. Shared products link to `https://<SITE_DOMAIN>/p/<id>`; see "Product links" below.
- **`EAS_PROJECT_ID`** and **`EXPO_OWNER`** select the client's EAS project. Without them EAS has no project to build in.
- **`EXPO_PUBLIC_SENTRY_DSN`** is the client's Sentry project (optional; blank turns error reporting off).
- **Values here are public.** They are bundled into the app, so they are safe to commit. Never put a secret in `eas.json` or in any `EXPO_PUBLIC_` variable.

### 3. EAS environments

EAS environment variables (`preview`, `production`) belong to one EAS project, so each client's project has its own: `GOOGLE_SERVICES_JSON` (their Firebase file), the Sentry upload settings and, while the app shows maps, `GOOGLE_MAPS_ANDROID_API_KEY`. Keep the values in the build profile (`APP_*`, `SITE_DOMAIN`, `EXPO_PUBLIC_*`, `SENTRY_PROJECT`, `EAS_PROJECT_ID`, `EXPO_OWNER`) out of the environments; when a name is in both, the build profile wins (`eas config --profile <profile>` shows which values are used).

### Google Maps key (Android, while the app has maps)

The customer app currently pins addresses on a map; iOS uses Apple Maps with no key, Android needs `GOOGLE_MAPS_ANDROID_API_KEY` at build time. Without it, Android builds pin the address to the phone's GPS position instead. The map is removed when the app moves to pincode-based addresses, and then no key is needed.

1. In [Google Cloud](https://console.cloud.google.com), pick a project with billing enabled. Under APIs & Services → Library, enable **Maps SDK for Android**.
2. APIs & Services → Credentials → **Create credentials → API key**. Restrict it to **Android apps** (the client's `APP_ID` and its signing SHA-1 from `npx eas-cli@latest credentials`, plus Google's app signing SHA-1 once on the Play Store) and to the **Maps SDK for Android**.
3. Save it in the client's EAS environments: `npx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment development --environment preview --environment production --visibility sensitive`, then rebuild.

Don't give the `MapView` a map ID (cloud-based styling): those loads are billed as Dynamic Maps.

### Product links

The customer app's Share button sends `https://<SITE_DOMAIN>/p/<id>`. With the app installed, the link opens the product in the app; otherwise the website shows the product. Opening in the app needs both sides:

1. **App:** `SITE_DOMAIN` in the client's build profiles (above), then a rebuild.
2. **Website:** the app's identity in the server's `deploy/.env`, then `docker compose up -d web`:
   - `ANDROID_APP_ID`: the customer app's `APP_ID`.
   - `ANDROID_CERT_SHA256`: the SHA-256 fingerprints of its signing keys, comma-separated. EAS shows the keystore's under `npx eas-cli@latest credentials` → Android → the package → keystore. Once the app is on the Play Store, add Google's app signing key too (Play Console → the app → Test and release → App integrity), or links from Play installs open the browser.
   - `IOS_APP_ID`: `<Apple Team ID>.<APP_ID>`, once there's an iOS app.

   Check `https://<SITE_DOMAIN>/.well-known/assetlinks.json` (404 while unset) and, on a phone with the app, `adb shell pm get-app-links <APP_ID>` shows `verified` for the domain. Android verifies when the app is installed, so reinstall the app after changing the fingerprints.

Without these, links still work: they open the website, and the app keeps opening its own `<APP_SCHEME>://product/<id>` links.

### 4. Build and publish

```bash
cd apps/customer
npx eas build --profile acme-preview --platform android --no-wait      # APK to install directly
npx eas build --profile acme-production --platform android --no-wait   # Play Store bundle
npx eas submit --platform android --id <build id>                       # upload to Play Console
```

- **Always submit by build ID,** never `--latest`.
- **Check before building:** `APP_BRAND=acme APP_NAME="Acme Store" npx expo config --type public` shows the resolved name, icon and splash.
- **Signing keys:** EAS creates a key for each package ID on its first build and keeps it in the client's EAS project. Never delete EAS credentials: without the key, the Play Store app can't be updated.
- **Play Store:** the client should own the Play Console account, so their name shows as the developer.
- **iOS:** needs an Apple Developer account; use the same commands with `--platform ios`.

Colours, logo, banners and texts inside the app come from the client's dashboard at runtime, so they change without a rebuild. A rebuild is needed only for the values in the build profile and the brand folder.

### 5. Building locally (when EAS cloud builds run out)

The Expo free plan has a monthly build quota. Once it's used up, build the same profiles on your own Linux or WSL2 machine with `--local`. The result is the same: the build downloads the app's signing key from EAS, so a local APK installs over a cloud-built one and keeps the fingerprint in `assetlinks.json`.

**One-time setup (Ubuntu or WSL2).** Java 17 and the Android command-line tools:

```bash
sudo apt install openjdk-17-jdk unzip
mkdir -p ~/Android/Sdk/cmdline-tools && cd ~/Android/Sdk/cmdline-tools
Z=commandlinetools-linux-13114758_latest.zip
curl -LO https://dl.google.com/android/repository/$Z
unzip $Z && mv cmdline-tools latest && rm $Z
```

Add to `~/.bashrc`, then open a new terminal:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

Accept the licences and install the SDK. The first build downloads the NDK and CMake it needs:

```bash
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Then:

- **Expo login:** `npx eas-cli@latest login` with an account that has access to the client's EAS project; the build fetches the signing key from there.
- **Firebase file:** download the client's `google-services.json` (Firebase → Project settings → Your apps) into `apps/customer/`. It is gitignored.
- **Small machines (WSL with 8 GB or less):** keep Gradle within memory in `~/.gradle/gradle.properties`. The last line builds for 64-bit ARM phones only, which makes test APKs build faster:

  ```properties
  org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8
  org.gradle.workers.max=2
  org.gradle.daemon=false
  org.gradle.parallel=false
  kotlin.daemon.jvmargs=-Xmx1024m
  reactNativeArchitectures=arm64-v8a
  ```

  On WSL, give it memory and swap in `C:\Users\<you>\.wslconfig` (`[wsl2]`, `memory=5GB`, `swap=8GB`), then `wsl --shutdown`.

**Build a preview APK** (from the app's folder; replace `acme` with the client):

```bash
cd apps/customer
B=$HOME/.cache/shop-build && mkdir -p $B &&
export GOOGLE_SERVICES_JSON=$PWD/google-services.json &&
export EAS_LOCAL_BUILD_WORKINGDIR=$B/eas-local &&
nohup npx eas-cli@latest build --profile acme-preview \
--platform android --local --non-interactive \
--output $B/acme-preview.apk \
> $B/acme-build.log 2>&1 &
```

Follow it with `tail -5 ~/.cache/shop-build/acme-build.log`; it ends with `Build successful` after about 15 to 30 minutes.

- **`GOOGLE_SERVICES_JSON`** must be an absolute path: the build copies the project to a temporary folder without gitignored files. Without it the APK works but gets no push notifications.
- **`EAS_LOCAL_BUILD_WORKINGDIR`** keeps the temporary folder out of `/tmp`, which is small and wiped when WSL restarts.
- **One heavy build at a time.** Don't run a second app build, a Docker build or the API tests alongside it.
- **The build uses your working copy**, uncommitted changes included. Build from a clean `main` for anything you hand out.

**Check and install.** The package, CPU and signing fingerprint (compare it with `npx eas-cli@latest credentials` → Android → the package):

```bash
BT=$(ls -d ~/Android/Sdk/build-tools/* | sort -V | tail -1)
APK=~/.cache/shop-build/acme-preview.apk
$BT/aapt2 dump badging $APK | grep -E "^package|native-code"
$BT/apksigner verify --print-certs $APK | grep SHA-256
```

On WSL, copy the APK to Windows (`cp $APK /mnt/c/Users/<you>/Downloads/`) and send it to the phone, or `adb install -r $APK` with the phone on USB debugging.

**Play Store bundle.** Remove the `reactNativeArchitectures` line from `~/.gradle/gradle.properties` first (the Play Store needs every CPU type), then build `--profile acme-production --output $B/acme.aab`. The version code still comes from EAS, so local and cloud builds stay in sequence. Upload the `.aab` in Play Console, or with `npx eas-cli@latest submit --platform android --path <file>`.

## Launch checklist (per client)

- [ ] `/health` is `ok` and the certificate is valid for all domains.
- [ ] SMS keys are set, and a real phone receives an OTP and signs in on the website and in the app.
- [ ] Storefront at `https://<SITE_DOMAIN>` loads with a valid certificate. Settings → Website: business name and address filled in, a help line phone or email set, and every policy page (including shipping and returns) read and adjusted to the client's terms. Give the website to the payment gateway, and the privacy page to the Play Store.
- [ ] Review login on while Google Play and the payment gateway review the app; off once both approve.
- [ ] Online payments: sandbox payment, failed payment and refund tested, with webhooks registered. Otherwise offer cash on delivery only.
- [ ] Shipping: default pickup location set, carrier keys saved and webhook registered, pincode check answers for a few real pincodes, shipping fees, COD fee and return window set.
- [ ] Products with variants, prices, stock, weights and dimensions.
- [ ] One full order end to end on the website and in the app: place, pack, ship (real AWB and label from the carrier), tracking updates arrive, delivered. A push notification arrives. Cancel the test shipment with the carrier if it isn't really sent.
- [ ] A return requested, approved, received, restocked and refunded.
- [ ] Backups appear in `deploy/backups`; the client knows they also need an off-site copy.
- [ ] Sentry: `SENTRY_DSN` set on the server and in the app's production profile. UptimeRobot monitors for the API, dashboard and storefront are green.
