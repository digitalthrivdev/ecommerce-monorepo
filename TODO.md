# Deferred work

Items intentionally postponed to finish the B1 MVP first. Move an item into active work only when it is needed.

## Next features (before launch)

- [ ] **Shareable product links.** The product screen's Share button sends a custom-scheme link (`<scheme>://product/<id>`), which many apps (e.g. WhatsApp) don't make tappable and which does nothing when the app isn't installed. Share `https://<SITE_DOMAIN>/p/<id>` instead: Android App Links and iOS Universal Links open it in the app (domain per client in `eas.json` and `app.config.js`, plus `/.well-known/assetlinks.json` and `apple-app-site-association` served by `apps/web`); without the app, `apps/web` shows a read-only product page (name, image, price) with the Google Play / App Store links from Settings → Website. Needs one app rebuild per client.

## Before the first production launch

- [ ] **Message Central go-live check.** Implemented from the VerifyNow guide but only tested against fake credentials. With a real account, add the keys under Settings → SMS provider keys, select it, and sign in with a real phone; confirm the token lifetime and whether `validateOtp` is GET or POST (both are handled).
- [ ] **Payment gateway go-live check.** Razorpay and Cashfree are implemented but only tested against fake credentials. Before launch, run a sandbox payment, a failed payment and a refund on each gateway the client will use, with `PUBLIC_API_URL` and `SECRETS_ENCRYPTION_KEY` set and webhooks registered (see `apps/api/.env.example`).
- [ ] **Push go-live check.** Expo Push is implemented (`PUSH_PROVIDER=expo`); confirm on a real device with a preview build that the push token registers and order updates arrive.
- [ ] **Off-site backups.** `deploy/` keeps daily database dumps and a copy of uploaded images on the server only (`deploy/backups`); copy them to object storage or another machine (e.g. a nightly rclone/rsync job).

## Delivery

- [ ] **Live tracking over WebSockets.** Push partner location and order status to the customer app (`@fastify/websocket`, Redis pub/sub so it works across API instances). Today the customer app polls `GET /orders/:id/tracking` every 10 seconds and glides the partner's marker on the map between updates; WebSockets are only worth it at much higher order volumes.
- [ ] Push to the previous partner when an admin reassigns or removes them from an order (only the new partner is notified today).
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

## Growth (after launch)

- [ ] Small-cart or handling fee (today only a delivery fee and a free-delivery threshold).
- [ ] Rider tips.
- [ ] WhatsApp or SMS order updates for customers who turned off notifications.
- [ ] Hindi and other local languages in the apps and website.
- [ ] Scheduled delivery slots.
- [ ] Substitutions when an item is out of stock.
- [ ] Wishlist.
- [ ] **Public product reviews.** Stars and text on a product from customers who received it, shown in the app and on the website, with admin moderation (hide, reply) in the dashboard. Separate from the private order ratings, which stay private.

## Auth

- [ ] Refresh tokens. Access tokens last `JWT_EXPIRES_IN` (7 days by default), then the user signs in again. Signing out revokes the token on the server (`POST /auth/logout`).

## Engineering

- [ ] More API tests: payments (webhooks, refunds), delivery assignment and the partner flow, inventory adjustments, coupons. `apps/api/test` covers auth, checkout, cancellation, products and GST today.
- [ ] Use `@grocery/validation` in the customer and delivery apps too (they still keep their own copy of the state list); needs Metro to resolve the workspace package.
