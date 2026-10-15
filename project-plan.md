 Shared context (paste at the top of every chat)

  This repo was cloned from a white-label quick-commerce grocery platform and
  is being turned into a white-label SINGLE-VENDOR e-commerce platform (like a
  Shopify store): one seller per deployment, any type of physical product,
  customer website (apps/web) + customer app (apps/customer) + admin dashboard
  (apps/admin) + Fastify API (apps/api). No delivery/rider app. Orders ship
  through third-party logistics (Shiprocket, Fship, any carrier, or manual
  self-ship) and online payment goes through any gateway (existing
  PaymentProvider pattern) plus COD.
  Keep: the stack (Fastify, Prisma 7.10 – never Prisma 8, PostgreSQL, Redis,
  Zod, Next.js 16, Expo), the layering, per-client isolated deployments, Decimal
  money, atomic stock updates, order snapshots, GST-inclusive prices, encrypted
  write-only credentials entered in the dashboard, phone OTP for customers,
  email+password for admins/staff.
  Target model:
  - ProductVariant holds price, compareAtPrice, stock (one Inventory row per
    variant), weightGrams, lengthCm, breadthCm, heightCm. No Store/StoreProduct.
  - Product drops grocery fields (isVeg, fssaiLicense, shelfLife, ingredients)
    and gets generic specifications (ordered key/value list). Keep HSN/GST,
    manufacturer, country of origin.
  - PickupLocation: address + phone used as the courier pickup (one default).
  - Order statuses: PENDING_PAYMENT, CONFIRMED, PACKED, SHIPPED, IN_TRANSIT,
    OUT_FOR_DELIVERY, DELIVERED, CANCELLED, RTO. Every change goes in
    OrderStatusHistory. Do not invent other states.
  - Shipment (one per order for now): provider, providerOrderId,
    providerShipmentId, awb, courierName, trackingUrl, labelUrl, status
    (PENDING, AWB_ASSIGNED, PICKUP_SCHEDULED, PICKED_UP, IN_TRANSIT,
    OUT_FOR_DELIVERY, DELIVERED, NDR, RTO_IN_TRANSIT, RTO_DELIVERED, CANCELLED,
    LOST) and ShipmentEvent history from webhooks/tracking.
  - Invoice number is assigned when the order is packed.
  - Shipping fee from settings: flat rate, free-shipping threshold, COD fee,
    optional weight slabs. Pincode serviceability (and COD availability) comes
    from the active carrier, cached in Redis; manual carrier accepts all.
  Do not build: multi-vendor, multiple shipments per order, exchanges, digital
  products, guest checkout, live carrier rate shopping, wallets, loyalty.
  Work style: inspect before changing, smallest coherent change, follow
  AGENTS.md and .cursor/rules. Never commit or push; finish with git add/commit
  commands (lines <= 72 chars, each but the last ending with &&) and next steps.
  Verify per AGENTS.md "Done means verified". Do only the phase below, then stop
  and report what changed, what was verified, and what is left.

  Progress (update when a phase is committed)

  [x] Phase 0 – done (commit 7434e6e)
  [x] Phase 1 – done (commit f53aa21)
  [x] Phase 2 – done (commit d662ce4). Left open: the app still shows
      "Delivery in about N minutes"; grocery wording in the website and app;
      leaflet packages unused in apps/admin. Address PIN codes are 6 digits
      as of Phase 6.
  [x] Phase 3 – done (commit 5f179d3). Manual and mock carriers, Shipment and
      ShipmentEvent, new OrderStatus, webhooks at /shipping/webhooks/:carrier,
      invoice numbered at PACKED. Left open: web tracking timeline (the
      website has no order pages until Phase 7); demo admins can't book
      shipments.
  [x] Phase 4 – done (commit 3dd5ebe). Left open: confirm the cash amount
      Shiprocket collects on one real test booking before launch; a blank
      customer email may be rejected; a webhook and a tracking refresh can
      show the same scan twice.
  [x] Phase 5 – done (commit ea32284). Left open: Fship publishes no
      webhooks and nothing polls tracking, so an order stays at its booked
      status until someone refreshes tracking.
  [x] Phase 6 – done. Shipping fee, free-shipping threshold, COD fee and
      optional weight slabs, calculated with Decimal and snapshotted on the
      order with their GST. Pincode check at GET /serviceability, enforced
      when the order is created. Addresses take a 6-digit PIN code.
  [x] Phase 7 – Website storefront. Customer website, storefront SEO, hosted
      checkout return, and mock payment/carrier purchase verified.
  [DONE] Phase 8 – Customer app
  [DONE] Phase 9 – Returns and RTO. Return requests, admin decisions,
      Shiprocket/manual reverse pickup, receipt restocking/refunds, and
      one-time RTO receipt restocking/online refunds implemented and verified.
  [ ] Phase 10 – Admin cleanup and deploy

  Phase 0: Detach from the grocery project and rewrite the docs [DONE]

  Phase 0 – detach and re-document. No feature code yet.
  1. Remove the deploy-moozy job from .github/workflows/ci.yml and delete
     deploy/ci-deploy.sh and anything that references moozy, its domains, SSH
     hosts or GHCR image names. Keep CI typecheck/lint/test.
  2. Rename the product: root/package names, Docker Compose project name, dev
     DB name/user (shop/shop/shop_dev), dev ports PostgreSQL 5434, Redis 6380;
     update .env.example files and README.
  3. Customer app: clear EAS projectId, owner, package/bundle IDs, scheme,
     google-services.json and brands/* to placeholders with a note in
     docs/deployment.md that each client needs new EAS and Firebase projects.
  4. Rewrite AGENTS.md, .cursor/rules/workflow.mdc and testing-and-deploy.mdc,
     docs/deployment.md and TODO.md for the single-vendor shop described above
     (scope, domain rules, order lifecycle, shipping provider rules, credential
     exception now also covering shipping carrier keys). Keep the Prisma,
     environment, security and verification sections. Remove moozy specifics.
  Do not delete apps/delivery yet. Verify: pnpm install, typecheck, lint.

  Phase 1: Remove delivery and riders [DONE]

  Phase 1 – remove delivery partners entirely.
  Delete apps/delivery and the API delivery module (partners, cash deposits,
  rider payouts, delivery OTP, live tracking, delivery cleanup), the models
  DeliveryPartner, CashDeposit, RiderPayout, Delivery, DeliveryLocation and
  their enums, rider review login, rider pieces of test accounts, realtime
  rider location, and every admin/customer/web screen, route, notification,
  report and setting that uses them (including the web "partner" page).
  Orders keep working end to end with an admin-driven status for now.
  Use rg to find every reference; leave none. Do not write migrations yet
  (Phase 2 rebuilds the migration baseline). Verify: prisma validate,
  prisma generate, typecheck, lint for all apps.

  Phase 2: Single seller, prices and stock on variants, fresh migration [DONE]

  Phase 2 – single seller.
  Remove Store, StoreHours, StoreProduct, geo/serviceability/nearest-store
  logic, service radius, store selection in cart and checkout, and the
  "store closed" rule. Move price, compareAtPrice and stock onto
  ProductVariant/Inventory (per variant). Point InventoryAdjustment at the
  variant. Add variant weight and dimensions, Product specifications, drop
  grocery-only product fields, add PickupLocation (admin CRUD, one default).
  Cart no longer has a store. Update catalog import, products, inventory,
  cart, coupons, orders, reports, admin pages and both customer frontends.
  Then replace apps/api/prisma/migrations with a single fresh init migration
  (this app has no production data), update the seed (admin, staff, customer,
  a few products with options, a pickup location), and run the Prisma steps
  from AGENTS.md. Verify: pnpm test, plus manual API checks for
  catalog, cart and COD order creation (success, invalid input,
  unauthorized, not found, out of stock).

  Phase 3: Shipping provider layer, order lifecycle, manual and mock carriers [DONE]

  Phase 3 – shipping abstraction and new order lifecycle.
  Create apps/api/src/modules/shipping modelled on payments/payment-provider.ts
  and gateway-registry.ts: a ShippingProvider interface (checkServiceability
  by pickup and delivery pincode, weight, cod -> serviceable, codAvailable,
  etaDays; createShipment; assignAwb; schedulePickup; getLabel; track;
  cancelShipment; parseWebhook -> normalized ShipmentEvent or null;
  checkCredentials), a CARRIERS registry with credential fields, env
  fallback and encrypted dashboard storage like PaymentGatewayCredential,
  and two carriers: "manual" (admin types courier name, AWB, tracking URL)
  and "mock" (non-production only). Add Shipment and ShipmentEvent models,
  the new OrderStatus enum, and the mapping from shipment status to order
  status (written to OrderStatusHistory). Webhook route verifies signatures
  and is idempotent. Admin: carrier settings, "Ship order" (choose package
  dimensions/weight, create shipment, print label), tracking timeline,
  cancel. Customer app and web: tracking timeline from ShipmentEvent.
  Move invoice numbering to PACKED. Cancelling before SHIPPED restocks and
  refunds as today. Verify fully (orders, money and stock rules).

  Phase 4: Shiprocket

  Phase 4 – Shiprocket carrier. Read the current Shiprocket API docs first
  (apiv2.shiprocket.in: token auth with an API user, serviceability, adhoc
  order create, assign AWB, generate pickup, label, tracking, cancel,
  webhooks) and cite the endpoints you use. Implement it as a ShippingProvider:
  cache the token in Redis until it expires, map Shiprocket statuses to
  our Shipment statuses, keep provider fields generic. Credentials: API user
  email, password, webhook token, pickup location nickname. Add unit tests
  with recorded sample responses; no real API calls in tests. Document setup
  in docs/deployment.md.

  Phase 5: Fship

  Phase 5 – Fship carrier. Same as the Shiprocket phase: read Fship's
  current API docs, implement the ShippingProvider (serviceability, create
  order/AWB, pickup, label, tracking, cancel, webhooks), map statuses,
  credentials via the registry, unit tests with sample responses, docs.
  Do not change the interface unless both carriers need it.

  Phase 6: Checkout shipping and COD [DONE]

  Phase 6 – checkout. Shipping fee from settings (flat, free threshold,
  COD fee, optional weight slabs) computed on the server with Decimal and
  snapshotted on the order (shippingFee, codFee, their GST). Pincode check
  endpoint for the product page and checkout using the active carrier,
  cached in Redis, and enforced at order creation (refuse unserviceable
  pincodes and COD where unavailable). Minimum order amount and per-item
  limits stay. Address: 6-digit pincode validation, lat/lng optional.
  Verify the money paths fully.

  Phase 7: Website storefront [DONE]

  Phase 7 – turn apps/web into a full storefront on the client's domain.
  Pages: home (existing Appearance sections), category and search listing
  with filters and pagination, product page (variant picker, images,
  specifications, pincode check, reviews), cart, checkout (address,
  shipping, COD/online via the existing hosted gateway page and return
  URL), sign-in with phone OTP (JWT in an httpOnly secure cookie, API
  called only from the server), account (orders, tracking, addresses,
  wishlist, returns), policy pages. SEO: metadata, Open Graph, sitemap.xml,
  robots.txt, Product JSON-LD, canonical URLs, server rendering with
  sensible caching. Use the theme colors and logo from settings. Verify
  typecheck, lint, a production build (one heavy build at a time), and a
  full test purchase with the mock gateway and mock carrier.

  Phase 8: Customer app [DONE]

  Phase 8 – customer app. Remove location permission, current-location
  flow, serviceability/nearest-store, store-closed states and live map
  tracking. Add pincode check, shipping and COD fees in cart/checkout,
  shipment tracking timeline with courier link, returns entry point.
  Generic product page (specifications instead of grocery fields).
  Verify typecheck and lint; give me the exact steps to test on a device.

  Phase 9: Returns and RTO

  Phase 9 – returns. Replace complaints with returns: customer requests a
  return within a return window from settings (per item, reason, photos via
  uploads), admin approves/rejects, reverse pickup via the carrier when it
  supports it or manual, on receipt admin restocks (logged) and refunds
  through the existing Refund flow. RTO shipments: admin confirms receipt,
  restock, refund online payments. Verify fully (money and stock).

  Phase 10: Admin cleanup and deploy

  Phase 10 – admin polish and deployment. Dashboard and reports for a shop
  (sales, orders by status, shipments awaiting pickup, NDR/RTO, low stock).
  Remove remaining grocery wording. Update deploy/ (compose, nginx, env
  examples for carrier keys, web storefront domain) and docs/deployment.md
  for a new client from scratch. Verify a local Docker build of the stack.
