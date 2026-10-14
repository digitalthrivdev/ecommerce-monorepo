# Deferred work

Items intentionally postponed to finish the MVP first. Move an item into active work only when it is needed. The conversion from the grocery platform (single seller, shipping carriers, storefront, returns) is planned separately and is not listed here.

## Before the first production launch

- [ ] **Payment gateway go-live check.** Razorpay and Cashfree are implemented but only tested against fake credentials. Before launch, run a sandbox payment, a failed payment and a refund on each gateway the client will use, with `PUBLIC_API_URL` and `SECRETS_ENCRYPTION_KEY` set and webhooks registered (see `apps/api/.env.example`).
- [ ] **Off-site backups.** `deploy/` keeps daily database dumps and a copy of uploaded images on the server only (`deploy/backups`); copy them to object storage or another machine (e.g. a nightly rclone/rsync job).

## Deployment

- [ ] **Prebuilt images.** Servers build their own images on every update (about 5 minutes and 1.5 GB of RAM). For small servers, CI could build the `api`, `migrate`, `admin` and `web` images once per commit and push them to a registry, and `update.sh` could pull them instead.
- [ ] **Automatic deploys** from CI to a client's server, once there are live clients (restricted SSH key, backup before update, health check after).

## Orders and payments

- [ ] Automatic refund of a duplicate online payment (currently logged as an error for manual refund).

## Catalog

- [ ] **Delete unused images.** Uploads are kept forever, including ones replaced or never saved. A periodic sweep could remove files under `uploads/images` that no product, category or appearance setting references.
- [ ] Object storage (e.g. Cloudflare R2) for a client that outgrows one server: a second implementation of `createImageStore` (`apps/api/src/modules/uploads/image-store.ts`).
- [ ] **Hand-picked products** on the home screen: product rails and banner/offer links can only point at a category today.
- [ ] **Automatic tab pages:** build a category tab's page from its sub-categories and products instead of hand-made sections.
- [ ] **Scheduled home content:** start/end dates for banners and offer strips (e.g. festival campaigns).

## Growth (after launch)

- [ ] WhatsApp or SMS order and shipment updates for customers who turned off notifications.
- [ ] Hindi and other local languages in the app and website.
- [ ] Admin replies shown under a product review.
- [ ] Abandoned cart reminders.

## Auth

- [ ] Refresh tokens. Access tokens last `JWT_EXPIRES_IN` (7 days by default), then the user signs in again. Signing out revokes the token on the server (`POST /auth/logout`).

## Engineering

- [ ] More API tests: payments (webhooks, refunds), inventory adjustments, coupons. `apps/api/test` covers auth, checkout, cancellation, products and GST today.
- [ ] Use `@shop/validation` in the customer app too (it still keeps its own copy of the state list); needs Metro to resolve the workspace package.
