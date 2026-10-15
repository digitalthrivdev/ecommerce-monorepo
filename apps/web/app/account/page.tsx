import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { updateProfile, signOut } from "@/lib/actions";
import { getCustomer } from "@/lib/session";
import { ActionForm, SubmitButton, fieldClass } from "@/components/shop/action-form";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };
export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) redirect(`/signin?next=${encodeURIComponent("/account")}`);
  return <section className="mx-auto w-full max-w-3xl px-5 py-10"><h1 className="mb-2 text-3xl font-bold">Your account</h1><p className="mb-7 text-muted-foreground">{customer.phone}</p><nav className="mb-8 grid gap-3 sm:grid-cols-3"><AccountLink href="/account/orders" title="Orders"/><AccountLink href="/account/addresses" title="Addresses"/><AccountLink href="/account/wishlist" title="Wishlist"/></nav><div className="grid gap-8 md:grid-cols-2"><div><h2 className="mb-3 text-xl font-bold">Profile</h2><ActionForm action={updateProfile} className="grid gap-3 rounded-2xl border bg-card p-4"><label className="grid gap-1 text-sm">Name<input className={fieldClass} name="name" defaultValue={customer.name ?? ""}/></label><label className="grid gap-1 text-sm">Email<input className={fieldClass} name="email" type="email" defaultValue={customer.email ?? ""}/></label><SubmitButton>Save profile</SubmitButton></ActionForm></div><form action={signOut} className="self-start"><button className="rounded-full border px-5 py-3 font-semibold">Sign out</button></form></div></section>;
}
function AccountLink({href,title}:{href:string;title:string}){return <Link href={href} className="rounded-2xl border bg-card p-5 font-semibold hover:border-primary">{title}<span className="mt-1 block text-sm font-normal text-muted-foreground">View and manage</span></Link>}
