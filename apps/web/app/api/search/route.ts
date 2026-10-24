import { NextResponse } from "next/server";

import { listProducts } from "@/lib/catalog";
import { cardOffer } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q || q.length < 2) {
    return NextResponse.json({ items: [] });
  }

  try {
    const page = await listProducts({ search: q, pageSize: 6 });
    const items = page.items.map((p) => {
      const offer = p.variants.length > 0 ? cardOffer(p.variants) : null;
      return {
        productId: p.productId,
        name: p.name,
        slug: p.slug,
        categoryName: p.category.name,
        brandName: p.brand?.name ?? null,
        imageUrl: p.imageUrl,
        price: offer ? offer.price : (p.variants[0]?.price ?? "0.00"),
        compareAtPrice: offer?.compareAtPrice ?? null,
        inStock: offer ? offer.inStock : (p.variants[0]?.inStock ?? true),
      };
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
