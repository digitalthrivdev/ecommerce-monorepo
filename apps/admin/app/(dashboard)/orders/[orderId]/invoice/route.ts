import { ApiError } from "@/lib/api";
import { proxyDownload } from "@/lib/downloads";

/** The order's GST invoice PDF, for admins and staff. */
export async function GET(_request: Request, ctx: RouteContext<"/orders/[orderId]/invoice">) {
  const { orderId } = await ctx.params;
  try {
    return await proxyDownload(`/admin/orders/${encodeURIComponent(orderId)}/invoice`);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return new Response(error.message, { status: error.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
