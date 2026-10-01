# Deferred work

Items intentionally postponed to finish the B1 MVP first. Move an item into active work only when it is needed.

## Before the first production launch

- [ ] **SMS provider for login OTP.** `apps/api/src/modules/auth/otp-sender.ts` refuses to run in production until a real sender (e.g. MSG91, Twilio) is added.
- [ ] **Real payment provider.** Implement `PaymentProvider` (`apps/api/src/modules/payments/payment-provider.ts`) for Razorpay or Cashfree, or deploy with `PAYMENT_PROVIDER=none` (cash on delivery only).
- [ ] **Per-IP rate limiting** on `POST /auth/send-otp` (per-phone limits already exist).
- [ ] **Production deployment:** Docker images, production Compose file, Nginx, secrets, backups.

## Delivery

- [ ] **Live tracking over WebSockets.** Push partner location and order status to the customer app (`@fastify/websocket`, Redis pub/sub so it works across API instances). Today the app polls `GET /orders/:id/tracking`.
- [ ] **Admin override to mark delivered** when the delivery OTP is locked after too many wrong attempts.
- [ ] **Admin unassign** (send an assigned order back to `READY_FOR_PICKUP` without picking a replacement).
- [ ] Semi-automatic assignment suggestion (nearest online partner, using last known location).

## Orders and store workflow

- [ ] **Partial fulfilment:** store marks individual items unavailable, totals and payment adjust, partial refund for online orders.
- [ ] Automatic refund of a duplicate online payment (currently logged as an error for manual refund).

## Inventory

- [ ] Inventory adjustment audit log (who changed stock, when, why).

## Engineering

- [ ] Automated test runner and CI (current verification uses throwaway scripts against the dev database).
