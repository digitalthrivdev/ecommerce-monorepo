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
  terms: `These terms apply when you use the {{appName}} app to buy products from {{businessName}}. By creating an account or placing an order, you agree to them.

## Your account
- You sign in with your mobile number and a one-time code sent by SMS. Keep your phone secure: anyone who can read your messages can sign in as you.
- You must be at least 18 years old, or use the app with the permission of a parent or guardian.
- Give a correct name, phone number and delivery address, so we can deliver your orders.

## Orders and prices
- Prices, offers and availability are shown in the app and can change at any time. The total shown at checkout, including any delivery charge, is the amount you pay.
- Placing an order is an offer to buy. We may not be able to supply every item.
- If an item turns out to be unavailable, it is removed from your order and you are not charged for it.

## Payment
- You can pay online (UPI, cards, net banking or wallets, through our payment partner) or with cash on delivery where it is offered.
- Online payments are processed by our payment partner. We do not see or store your card or bank details.

## Delivery
- Delivery times shown in the app are estimates. Our Shipping and Delivery Policy explains how orders are delivered.

## Cancellations and refunds
Cancellations and refunds are covered by our Cancellation and Refund Policy.

## Using the app fairly
Do not misuse the app: no false orders, abuse of couriers or staff, or attempts to interfere with the service. We may suspend accounts that do.

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
- Delivery addresses, to deliver your orders.
- Your orders, payments and order history.
- A notification token for your device, if you allow notifications, to tell you about your orders.

We do not collect your card or bank details: online payments are handled by our payment partner.

## How we use it
- To take, prepare, deliver and support your orders.
- To send sign-in codes and order updates.
- To prevent fraud and keep the service secure.
- To meet our legal and tax obligations.

## Who we share it with
- The people preparing your order and the courier delivering it, who see your name, phone number and delivery address.
- Our payment partner, to process online payments and refunds.
- Our SMS and notification providers, to send codes and updates.
- Authorities, when the law requires it.

We do not sell your personal information.

## How long we keep it
We keep your account and order history while your account is active, and longer where the law requires it (for example, tax records).

## Your rights
You can ask us to access or correct your personal information by contacting us below. You can delete your account yourself in the app: open Account, tap your name to open Your profile, then tap Delete account at the bottom and confirm. The Delete Your Account page on our website explains the same steps. You can also ask us to delete it. Deleting it removes your name, email, phone number and saved addresses; records of past orders are kept where the law requires it (for example, tax records). We handle your information in line with India's Digital Personal Data Protection Act, 2023.

## Security
We protect your information with access controls and encrypted connections. No system is completely secure, so please keep your phone and sign-in codes private.

## Changes
We may update this policy. The new version applies from the date it is published here.

## Contact and grievances
For any question or complaint about your personal information, contact us:

{{contact}}`,

  refunds: `This policy explains when you can cancel an order with {{appName}} and how refunds work.

## Cancelling an order
- You can cancel an order in the app until we pack it. After that it can no longer be cancelled from the app; contact us and we will help where we can, until it ships.
- Orders paid online that are not paid within the time shown at checkout are cancelled automatically.
- We may cancel an order if items are unavailable, or the order cannot be delivered to the address. You will be refunded in full for anything you paid.

## Unavailable items
If we cannot supply an item, it is removed from your order. For online payments, the amount for that item is refunded automatically; for cash on delivery, you simply pay less.

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
We deliver to addresses in India. If we cannot deliver to your address, we will contact you and refund anything you paid.

## Delivery times
Orders are packed and handed to a courier, who delivers them. Times shown are estimates and can be longer at busy times or in bad weather. Once your order ships, you can track it in the app with the courier's tracking number.

## Delivery charges
Any delivery charge, minimum order value or free-delivery threshold is shown in your cart and at checkout before you pay.

## Receiving your order
- Someone must be available at the address to receive the order.
- For cash on delivery, please pay the amount shown in the app when you receive your order.

## If we cannot deliver
If we cannot reach you or the address cannot be found, we may cancel the order. Online payments for cancelled orders are refunded as described in our Cancellation and Refund Policy.

## Contact
{{contact}}`,
};
