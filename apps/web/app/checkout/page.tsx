import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { saveAddress } from "@/lib/actions";
import { getCart, listAddresses } from "@/lib/catalog";
import { formatMoney } from "@/lib/utils";
import { getSettings } from "@/lib/website";
import { getCustomer } from "@/lib/session";
import { ActionForm, SubmitButton, fieldClass } from "@/components/shop/action-form";
import { DirectCheckoutForm } from "@/components/shop/direct-checkout-form";
import { PLACE_ORDER_FORM_ID, PlaceOrderForm } from "@/components/shop/place-order-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export default async function CheckoutPage() {
  const customer = await getCustomer();
  const [cart, settings] = await Promise.all([getCart(), getSettings()]);
  if (!cart.items.length) redirect("/cart");

  const addressResult = customer ? await listAddresses().catch(() => ({ items: [] })) : { items: [] };
  const addresses = addressResult.items;
  const methods = cart.checkout?.paymentMethods ?? [];

  if (!customer) {
    const directItems = cart.items.map((item) => ({
      variantId: item.variantId,
      name: item.name,
      variantLabel: item.variantLabel,
      imageUrl: item.imageUrl,
      price: item.unitPrice ?? "0",
      quantity: item.quantity,
    }));

    return (
      <section className="mx-auto w-full max-w-2xl px-5 py-10">
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Checkout</h1>
        <p className="mb-6 text-sm text-muted-foreground">Please fill details in english only to complete your order</p>
        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <DirectCheckoutForm
            items={directItems}
            currency={settings.currency}
            defaultCustomer={null}
            savedAddresses={[]}
            showItemHeader={true}
          />
        </div>
      </section>
    );
  }
  return <section className="mx-auto w-full max-w-5xl px-5 py-10"><h1 className="mb-7 text-3xl font-bold">Checkout</h1>{!cart.isValid && <p className="mb-5 rounded-xl bg-red-50 p-4 text-red-800">Please resolve unavailable items in your <Link href="/cart" className="underline">cart</Link> before checkout.</p>}<div className="grid gap-8 lg:grid-cols-[1fr_20rem]"><div className="flex flex-col gap-6"><section><h2 className="mb-3 text-xl font-bold">Delivery address</h2>{addresses.length ? <div className="grid gap-3">{addresses.map((address,index)=><label key={address.id} className="flex cursor-pointer gap-3 rounded-2xl border bg-card p-4"><input type="radio" name="addressId" value={address.id} form={PLACE_ORDER_FORM_ID} defaultChecked={address.isDefault || (!addresses.some((a)=>a.isDefault) && index===0)} className="mt-1 accent-primary"/><span><span className="font-semibold">{address.label || address.name}</span><br/><span className="text-sm text-muted-foreground">{address.name}, {address.phone}<br/>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}{address.landmark ? `, ${address.landmark}` : ""}<br/>{address.city}, {address.state} {address.postalCode}</span></span></label>)}</div> : <p className="rounded-xl border p-4 text-muted-foreground">Add an address to continue.</p>}</section><details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer font-semibold">Add a new address</summary><ActionForm action={saveAddress} className="mt-4 grid gap-3 sm:grid-cols-2"><input type="hidden" name="next" value="/checkout"/><Field name="name" label="Full name"/><Field name="phone" label="Phone" type="tel"/><Field name="addressLine1" label="Address line 1"/><Field name="addressLine2" label="Address line 2" required={false}/><Field name="landmark" label="Landmark" required={false}/><Field name="city" label="City"/><Field name="state" label="State"/><Field name="postalCode" label="6-digit pincode" inputMode="numeric"/><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault"/> Set as default</label><SubmitButton className="sm:col-span-2">Save address</SubmitButton></ActionForm></details><section><h2 className="mb-3 text-xl font-bold">Payment</h2>{methods.length ? <PlaceOrderForm methods={methods} total={cart.bill?.total ?? cart.subtotal} totalWithCod={cart.bill?.totalWithCod ?? cart.bill?.total ?? cart.subtotal} currency={settings.currency} enabled={cart.isValid && addresses.length > 0}/> : <p className="rounded-xl border p-4">No payment methods are available for this order.</p>}</section></div><aside className="h-fit rounded-2xl border bg-card p-5"><h2 className="mb-3 font-semibold">Order summary</h2>{cart.items.map((item)=><p key={item.id} className="flex justify-between gap-3 py-1 text-sm"><span>{item.quantity} × {item.name}</span><span>{item.lineTotal ? formatMoney(item.lineTotal,settings.currency) : "—"}</span></p>)}<div className="my-3 border-t"/><MoneyRow label="Subtotal" value={cart.bill?.subtotal ?? cart.subtotal} currency={settings.currency}/>{cart.bill && <><MoneyRow label="Shipping" value={cart.bill.shippingFee} currency={settings.currency}/><MoneyRow label="Discount" value={`-${cart.bill.discount}`} currency={settings.currency}/><MoneyRow label="Total before COD fee" value={cart.bill.total} currency={settings.currency}/><MoneyRow label="Total with COD" value={cart.bill.totalWithCod} currency={settings.currency} bold/></>}</aside></div></section>;
}
function Field({name,label,type="text",required=true,inputMode}:{name:string;label:string;type?:string;required?:boolean;inputMode?:"numeric"|"tel"}){return <label className="grid gap-1 text-sm font-medium">{label}<input className={fieldClass} name={name} type={type} required={required} inputMode={inputMode} maxLength={name==="postalCode"?6:undefined}/></label>}
function MoneyRow({label,value,currency,bold=false}:{label:string;value:string;currency:string;bold?:boolean}){return <p className={`flex justify-between gap-3 py-1 text-sm ${bold?"text-base font-bold":""}`}><span>{label}</span><span>{value.startsWith("-")?"-":""}{formatMoney(value.replace(/^-/,""),currency)}</span></p>}
