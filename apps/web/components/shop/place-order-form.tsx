"use client";

import { useActionState } from "react";

import { placeOrder } from "@/lib/actions";
import { formatMoney } from "@/lib/utils";
import { SubmitButton } from "./action-form";

export const PLACE_ORDER_FORM_ID = "place-order";

export function PlaceOrderForm({ methods, total, totalWithCod, currency, enabled }: { methods: ("COD" | "ONLINE")[]; total: string; totalWithCod: string; currency: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(placeOrder, { error: null });
  return <form id={PLACE_ORDER_FORM_ID} action={action} className="grid gap-3 rounded-2xl border bg-card p-4">{methods.map((method,index)=><label key={method} className="flex items-center gap-3"><input type="radio" name="paymentMethod" value={method} defaultChecked={index===0} className="accent-primary"/><span>{method === "COD" ? `Cash on delivery · ${formatMoney(totalWithCod,currency)}` : `Pay online · ${formatMoney(total,currency)}`}</span></label>)}{state.error&&<p role="alert" className="text-sm text-red-700">{state.error}</p>}<SubmitButton disabled={!enabled||pending}>{pending?"Placing order…":"Place order"}</SubmitButton></form>;
}
