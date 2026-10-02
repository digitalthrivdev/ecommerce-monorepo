# Deferred work

Items intentionally postponed to finish the B1 MVP first. Move an item into active work only when it is needed.

## Before the first production launch

- [ ] **Message Central go-live check.** Implemented from the VerifyNow guide but only tested against fake credentials. With a real account, add the keys under Settings → SMS provider keys, select it, and sign in with a real phone; confirm the token lifetime and whether `validateOtp` is GET or POST (both are handled).
- [ ] **First production admin.** Admin accounts are only created by the development seed. Add a way to create the first admin on a fresh deployment (e.g. a one-off script); that admin then signs in with the OTP from the server log and sets up SMS.
- [ ] **Payment gateway go-live check.** Razorpay and Cashfree are implemented but only tested against fake credentials. Before launch, run a sandbox payment, a failed payment and a refund on each gateway the client will use, with `PUBLIC_API_URL` and `SECRETS_ENCRYPTION_KEY` set and webhooks registered (see `apps/api/.env.example`).
- [ ] **Real push provider.** Implement `PushSender` (`apps/api/src/modules/notifications/push-sender.ts`) for Expo Push (or FCM/APNs), or deploy with `PUSH_PROVIDER=none` (no pushes).
- [ ] **Per-IP rate limiting** on `POST /auth/send-otp` (per-phone limits already exist).
- [ ] **Production deployment:** Docker images, production Compose file, Nginx, secrets, backups.

## Delivery

- [ ] **Live tracking over WebSockets.** Push partner location and order status to the customer app (`@fastify/websocket`, Redis pub/sub so it works across API instances). Today the app polls `GET /orders/:id/tracking`.
- [ ] **Admin override to mark delivered** when the delivery OTP is locked after too many wrong attempts.
- [ ] **Admin unassign** (send an assigned order back to `READY_FOR_PICKUP` without picking a replacement).
- [ ] Semi-automatic assignment suggestion (nearest online partner, using last known location).
- [ ] Push to the previous partner when an admin reassigns their order (only the new partner is notified today).
- [ ] **Map pin for customer addresses.** The customer app pins an address to the phone's GPS position when it is saved; there is no map to drag the pin or search for a place.

## Orders and store workflow

- [ ] Undo for an item marked unavailable by mistake (today the refund is issued immediately, so it is final).
- [ ] Automatic refund of a duplicate online payment (currently logged as an error for manual refund).

## Inventory

- [ ] Inventory adjustment audit log (who changed stock, when, why).

## Catalog

- [ ] **Image upload** for products, categories, the logo and home banners (object storage such as S3/R2 plus a signed upload URL). Admin currently takes an image URL.
- [ ] **Hand-picked products** on the home screen: product rails and banner/offer links can only point at a category today.
- [ ] **Scheduled home content:** start/end dates for banners and offer strips (e.g. festival campaigns).
- [ ] **Bulk import** of products, store prices and opening stock from CSV, for onboarding a new client's catalog.

## Stores

- [ ] **Opening hours.** Stores accept orders whenever they are active; there is no schedule or "closed for the night" state.
- [ ] Map picker for the store location and a preview of the delivery radius. Admin currently enters latitude and longitude.
- [ ] Show the store phone to delivery partners (delivery app) and customers.

## Auth

- [ ] Refresh tokens and server-side logout. Access tokens stay valid until they expire; signing out only deletes the cookie.

## Engineering

- [ ] Automated test runner and CI (current verification uses throwaway scripts against the dev database).
- [ ] Share validation rules (phone, money, slugs) between the API and admin through `packages/validation` instead of duplicating them.
