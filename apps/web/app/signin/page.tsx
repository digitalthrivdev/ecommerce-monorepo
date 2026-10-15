import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/shop/signin-form";
import { getCustomer } from "@/lib/session";
import { safeNext } from "@/lib/paths";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const params = await searchParams;
  const next = safeNext(Array.isArray(params.next) ? params.next[0] : params.next);
  if (await getCustomer()) redirect(next === "/account" ? "/account" : next);
  return <section className="mx-auto w-full max-w-md px-5 py-16"><h1 className="mb-2 text-3xl font-bold">Sign in</h1><p className="mb-6 text-muted-foreground">We’ll send a one-time code to your phone.</p><SignInForm next={next}/></section>;
}
