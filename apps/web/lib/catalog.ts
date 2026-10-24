import "server-only";

import { cache } from "react";

import { ApiError, apiAuth, apiGet, apiRequest, readToken } from "./api";
import { readGuestCart } from "./guest-cart";
import type {
  Address,
  Cart,
  CatalogProduct,
  CatalogProductDetail,
  CategoryDetail,
  CategorySummary,
  OrderDetail,
  OrderSummary,
  Page,
  ProductReviews,
  Serviceability,
  WishlistItem,
} from "./types";

const PAGE = 24;

export function pageOffset(page: number) {
  return (Math.max(1, page) - 1) * PAGE;
}

export { PAGE as LISTING_PAGE_SIZE };

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const listCategories = cache(async (params: { parentId?: string; topLevel?: boolean } = {}) => {
  const items: CategorySummary[] = [];
  let offset = 0;
  for (;;) {
    const page = await apiGet<Page<CategorySummary>>(`/categories${query({ limit: 200, offset, parentId: params.parentId, topLevel: params.topLevel ? "true" : undefined })}`);
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return items;
  }
});

export const categoryBySlug = cache(async (slug: string) => {
  const categories = await listCategories();
  const summary = categories.find((category) => category.slug === slug);
  if (!summary) return null;
  try {
    return await apiGet<CategoryDetail>(`/categories/${encodeURIComponent(summary.id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
});

export function listProducts(params: {
  categoryId?: string;
  brandId?: string;
  search?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  inStock?: boolean | string;
  sortBy?: "newest" | "price_asc" | "price_desc" | "name_asc" | string;
  page?: number;
  pageSize?: number;
}) {
  return apiGet<Page<CatalogProduct>>(
    `/catalog/products${query({
      limit: params.pageSize ?? PAGE,
      offset: (Math.max(1, params.page ?? 1) - 1) * (params.pageSize ?? PAGE),
      categoryId: params.categoryId,
      brandId: params.brandId,
      search: params.search,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      inStock: params.inStock ? "true" : undefined,
      sortBy: params.sortBy,
    })}`,
  );
}

export const getCatalogProduct = cache(async (id: string) => {
  try {
    return await apiGet<CatalogProductDetail>(`/catalog/products/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
});

export function listBrands(categoryId?: string) {
  return apiGet<{ items: { id: string; name: string; slug: string; logoUrl: string | null; productCount: number }[] }>(
    `/catalog/brands${query({ categoryId, limit: 50 })}`,
  );
}

export function productReviews(productId: string, page = 1) {
  return apiGet<ProductReviews>(`/products/${encodeURIComponent(productId)}/reviews${query({ limit: 10, offset: Math.max(0, page - 1) * 10 })}`);
}

export function alsoBought(productId: string) {
  return apiGet<{ items: CatalogProduct[] }>(`/catalog/products/also-bought${query({ productIds: productId, limit: 8 })}`).catch(() => ({ items: [] }));
}

export function checkServiceability(pincode: string) {
  return apiRequest<Serviceability>(`/serviceability${query({ pincode, weightGrams: 0, cod: "true" })}`, { revalidate: 300 });
}

export async function getCart(): Promise<Cart> {
  const token = await readToken();
  if (token) {
    try {
      return await apiAuth<Cart>("/cart");
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        throw e;
      }
    }
  }

  const items = await readGuestCart();
  if (items.length === 0) {
    return {
      id: null,
      items: [],
      itemCount: 0,
      subtotal: "0.00",
      coupon: null,
      bill: null,
      checkout: null,
      isValid: false,
    };
  }

  try {
    return await apiRequest<Cart>("/cart/preview", {
      method: "POST",
      body: { items },
    });
  } catch {
    return {
      id: null,
      items: [],
      itemCount: 0,
      subtotal: "0.00",
      coupon: null,
      bill: null,
      checkout: null,
      isValid: false,
    };
  }
}

export function listAddresses() {
  return apiAuth<{ items: Address[] }>("/users/me/addresses");
}

export function listOrders(page = 1) {
  return apiAuth<Page<OrderSummary>>(`/orders${query({ limit: 20, offset: Math.max(0, page - 1) * 20 })}`);
}

export function getOrder(id: string) {
  return apiAuth<OrderDetail>(`/orders/${encodeURIComponent(id)}`);
}

export function listWishlist(page = 1) {
  return apiAuth<Page<WishlistItem>>(`/wishlist${query({ limit: PAGE, offset: pageOffset(page) })}`);
}

export function wishlistIds() {
  return apiAuth<{ productIds: string[] }>("/wishlist/ids");
}

export function buyAgain() {
  return apiAuth<{ items: CatalogProduct[] }>("/orders/buy-again?limit=12");
}

export function orderReviews(orderId: string) {
  return apiAuth<{ items: { productId: string; productName: string; imageUrl: string | null; rating: number | null; comment: string | null }[] }>(
    `/orders/${encodeURIComponent(orderId)}/reviews`,
  );
}
