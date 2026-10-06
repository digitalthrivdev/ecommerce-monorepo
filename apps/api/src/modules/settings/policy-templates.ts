/**
 * Starting text for the public policy pages, written to match how the platform works. Admins edit
 * them in the dashboard. Format: "## " starts a heading, "- " a list item, and a blank line separates
 * paragraphs. Placeholders: {{appName}}, {{businessName}} (falls back to the app name) and
 * {{contact}} (a list of the business address, email and phone that are set).
 */
export const POLICY_SLUGS = ["terms", "privacy", "refunds", "shipping"] as const;

export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const POLICY_TITLES: Record<PolicySlug, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refunds: "Cancellation and Refund Policy",
  shipping: "Shipping and Delivery Policy",
};

export const POLICY_TEMPLATES: Record<PolicySlug, string> = {
  terms: `These terms apply when you use the {{appName}} app to buy groceries and household products from {{businessName}}. By creating an account or placing an order, you agree to them.

## Your account
- You sign in with your mobile number and a one-time code sent by SMS. Keep your phone secure: anyone who can read your messages can sign in as you.
- You must be at least 18 years old, or use the app with the permission of a parent or guardian.
- Give a correct name, phone number and delivery address, so we can deliver your orders.

## Orders and prices
- Prices, offers and availability are shown in the app and can change at any time. The total shown at checkout, including any delivery charge, is the amount you pay.
- Placing an order is an offer to buy. The order is confirmed when it is accepted, and the store may not be able to supply every item.
- If an item turns out to be unavailable, it is removed from your order and you are not charged for it.

## Payment
- You can pay online (UPI, cards, net banking or wallets, through our payment partner) or with cash on delivery where it is offered.
- Online payments are processed by our payment partner. We do not see or store your card or bank details.

## Delivery
- We deliver only to addresses inside the area our stores serve. Delivery times shown in the app are estimates.
- At delivery you will be asked for a one-time delivery code shown in the app. Share it only when you receive your order.

## Cancellations and refunds
Cancellations and refunds are covered by our Cancellation and Refund Policy.

## Using the app fairly
Do not misuse the app: no false orders, abuse of delivery partners or staff, or attempts to interfere with the service. We may suspend accounts that do.

## Liability
We take care to describe products correctly and deliver them in good condition. To the extent the law allows, our liability for any order is limited to the amount you paid for it.

## Changes to these terms
We may update these terms. The new version applies from the date it is published here.

## Governing law
These terms are governed by the laws of India. Courts at the place of our registered office have jurisdiction.

## Contact
{{contact}}`,

  privacy: `This policy explains what personal information {{businessName}} collects through the {{appName}} app, how we use it, and your choices.

## What we collect
- Your mobile number and name, to create your account and sign you in.
- Delivery addresses, including the map location you pin, to deliver your orders and check that we serve your area.
- Your orders, payments and order history.
- A notification token for your device, if you allow notifications, to tell you about your orders.
- For delivery partners: their location while they are online in the delivery app, to assign and track deliveries.

We do not collect your card or bank details: online payments are handled by our payment partner.

## How we use it
- To take, prepare, deliver and support your orders.
- To send sign-in codes and order updates.
- To prevent fraud and keep the service secure.
- To meet our legal and tax obligations.

## Who we share it with
- The store preparing your order and the delivery partner bringing it, who see your name, phone number and delivery address.
- Our payment partner, to process online payments and refunds.
- Our SMS and notification providers, to send codes and updates.
- Authorities, when the law requires it.

We do not sell your personal information.

## How long we keep it
We keep your account and order history while your account is active, and longer where the law requires it (for example, tax records). Delivery partner locations are kept only as needed to run and review deliveries.

## Your rights
You can ask us to access, correct or delete your personal information, or to close your account, by contacting us below. Some records may have to be kept for legal reasons. We handle your information in line with India's Digital Personal Data Protection Act, 2023.

## Security
We protect your information with access controls and encrypted connections. No system is completely secure, so please keep your phone and sign-in codes private.

## Changes
We may update this policy. The new version applies from the date it is published here.

## Contact and grievances
For any question or complaint about your personal information, contact us:

{{contact}}`,

  refunds: `This policy explains when you can cancel an order with {{appName}} and how refunds work.

## Cancelling an order
- You can cancel an order in the app until the store accepts it. After that, the order is being packed and can no longer be cancelled from the app; contact us and we will help where we can.
- Orders paid online that are not paid within the time shown at checkout are cancelled automatically.
- We may cancel an order if items are unavailable, the address is outside our delivery area, or the order cannot be delivered. You will be refunded in full for anything you paid.

## Unavailable items
If the store cannot supply an item, it is removed from your order. For online payments, the amount for that item is refunded automatically; for cash on delivery, you simply pay less.

## Damaged, wrong or missing items
Check your order at delivery. If an item is damaged, wrong, missing or expired, contact us within 24 hours of delivery with your order number (and a photo, where possible). We will refund or replace the item.

## How refunds are paid
- Refunds for online payments go back to the original payment method (UPI, card, bank account or wallet).
- Once we issue a refund, it usually reaches you within 5 to 7 working days, depending on your bank or payment app.
- Cash on delivery orders are refunded to a UPI ID or bank account you give us.

## Contact
{{contact}}`,

  shipping: `This policy explains how {{appName}} delivers your orders.

## Where we deliver
We deliver only to addresses inside the area served by our stores. The app checks your address when you add it and tells you if we do not deliver there yet.

## Delivery times
Orders are delivered from the nearest store that has your items, usually the same day and often within the hour. Times shown in the app are estimates and can be longer at busy times or in bad weather. You can follow your order and your delivery partner in the app.

## Delivery charges
Any delivery charge, minimum order value or free-delivery threshold is shown in your cart and at checkout before you pay.

## Receiving your order
- Someone must be available at the address to receive the order.
- The delivery partner will ask for the one-time delivery code shown in the app. Share it only after you receive your order.
- For cash on delivery, please pay the delivery partner the amount shown in the app.

## If we cannot deliver
If we cannot reach you or the address cannot be found, we may cancel the order. Online payments for cancelled orders are refunded as described in our Cancellation and Refund Policy.

## Contact
{{contact}}`,
};
