# Deferred work

Items intentionally postponed to finish the B1 MVP first. Move an item into active work only when it is needed.

## Before the first production launch

- [ ] **Message Central go-live check.** Implemented from the VerifyNow guide but only tested against fake credentials. With a real account, add the keys under Settings → SMS provider keys, select it, and sign in with a real phone; confirm the token lifetime and whether `validateOtp` is GET or POST (both are handled).
- [ ] **Payment gateway go-live check.** Razorpay and Cashfree are implemented but only tested against fake credentials. Before launch, run a sandbox payment, a failed payment and a refund on each gateway the client will use, with `PUBLIC_API_URL` and `SECRETS_ENCRYPTION_KEY` set and webhooks registered (see `apps/api/.env.example`).
- [ ] **Push go-live check.** Expo Push is implemented (`PUSH_PROVIDER=expo`); confirm on a real device with a preview build that the push token registers and order updates arrive.
- [ ] **Off-site backups.** `deploy/` keeps daily database dumps and a copy of uploaded images on the server only (`deploy/backups`); copy them to object storage or another machine (e.g. a nightly rclone/rsync job).

## Deployment

- [ ] Build images in CI and push them to a registry, so small VPSs do not have to build (the admin build needs about 1.5 GB of RAM).
- [ ] Smaller API image (about 800 MB): the Prisma CLI and Studio are pulled into production dependencies as a peer of `@prisma/client`.

## Delivery

- [ ] **Live tracking over WebSockets.** Push partner location and order status to the customer app (`@fastify/websocket`, Redis pub/sub so it works across API instances). Today the customer app polls `GET /orders/:id/tracking` every 10 seconds and glides the partner's marker on the map between updates; WebSockets are only worth it at much higher order volumes.
- [ ] **Admin override to mark delivered** when the delivery OTP is locked after too many wrong attempts.
- [ ] **Admin unassign** (send an assigned order back to `READY_FOR_PICKUP` without picking a replacement).
- [ ] Push to the previous partner when an admin reassigns their order (only the new partner is notified today).
- [ ] Place suggestions while typing (Google Places autocomplete through the API). Search today finds a typed address with the phone's geocoder or Nominatim, without suggestions.

## Orders and store workflow

- [ ] Undo for an item marked unavailable by mistake (today the refund is issued immediately, so it is final).
- [ ] Automatic refund of a duplicate online payment (currently logged as an error for manual refund).

## Catalog

- [ ] **Delete unused images.** Uploads are kept forever, including ones replaced or never saved. A periodic sweep could remove files under `uploads/images` that no product, category or appearance setting references.
- [ ] Object storage (e.g. Cloudflare R2) for a client that outgrows one server: a second implementation of `createImageStore` (`apps/api/src/modules/uploads/image-store.ts`).
- [ ] **Hand-picked products** on the home screen: product rails and banner/offer links can only point at a category today.
- [ ] **Automatic tab pages:** build a category tab's page from its sub-categories and products instead of hand-made sections.
- [ ] **Scheduled home content:** start/end dates for banners and offer strips (e.g. festival campaigns).
- [ ] **Bulk import** of products, store prices and opening stock from CSV, for onboarding a new client's catalog.

## Stores

- [ ] Show the store phone to delivery partners (delivery app) and customers.

## Auth

- [ ] Refresh tokens and server-side logout. Access tokens stay valid until they expire; signing out only deletes the cookie.

## Engineering

- [ ] Automated test runner and CI (current verification uses throwaway scripts against the dev database).
- [ ] Share validation rules (phone, money, slugs) between the API and admin through `packages/validation` instead of duplicating them.
