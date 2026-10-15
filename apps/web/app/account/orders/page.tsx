import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { listOrders } from "@/lib/catalog";
import { getCustomer } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/utils";
import { getSettings } from "@/lib/website";
import { orderStatusLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Your orders", robots: { index: false, follow: false } };
export default async function OrdersPage({searchParams}:PageProps<"/account/orders">){if(!(await getCustomer()))redirect(`/signin?next=${encodeURIComponent("/account/orders")}`);const params=await searchParams;const page=Math.max(1,Math.floor(Number(params.page)||1));const [orders,settings]=await Promise.all([listOrders(page),getSettings()]);return <><PageTitle title="Your orders"/><div className="mx-auto w-full max-w-4xl px-5 pb-12"><ul className="divide-y rounded-2xl border bg-card">{orders.items.map(order=><li key={order.id}><Link href={`/account/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted"><span><span className="block font-semibold">{order.orderNumber}</span><span className="text-sm text-muted-foreground">{formatDate(order.createdAt,settings.timezone)} · {order.itemCount} items</span></span><span className="text-right"><span className="block font-semibold">{formatMoney(order.total,settings.currency)}</span><span className="text-sm text-muted-foreground">{orderStatusLabel(order.status)}</span></span></Link></li>)}</ul>{orders.items.length===0&&<p className="rounded-2xl border p-8 text-center text-muted-foreground">You haven’t placed an order yet. <Link className="underline" href="/search">Browse products</Link>.</p>}<div className="mt-5 flex justify-between">{page>1?<Link className="underline" href={`?page=${page-1}`}>Previous</Link>:<span/>}{page*orders.limit<orders.total&&<Link className="underline" href={`?page=${page+1}`}>Next</Link>}</div></div></>}
