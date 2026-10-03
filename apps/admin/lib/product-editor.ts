import type { Listing, ProductDetail, ProductListings, Store } from "./types";

/** Text fields of the product form, as typed. */
export type DetailsDraft = {
  name: string;
  description: string;
  categoryId: string;
  brandId: string;
  /** "veg" | "non-veg" | "none" */
  isVeg: string;
  tags: string;
  gstRate: string;
  hsnCode: string;
  manufacturerName: string;
  manufacturerAddress: string;
  countryOfOrigin: string;
  fssaiLicense: string;
  shelfLife: string;
  ingredients: string;
  slug: string;
  isActive: boolean;
};

export const NONE = "none";

export function detailsFromProduct(product?: ProductDetail): DetailsDraft {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.categoryId ?? "",
    brandId: product?.brandId ?? NONE,
    isVeg: product?.isVeg === true ? "veg" : product?.isVeg === false ? "non-veg" : NONE,
    tags: product?.tags.join(", ") ?? "",
    gstRate: product?.gstRate ? Number(product.gstRate).toString() : "",
    hsnCode: product?.hsnCode ?? "",
    manufacturerName: product?.manufacturerName ?? "",
    manufacturerAddress: product?.manufacturerAddress ?? "",
    countryOfOrigin: product?.countryOfOrigin ?? "",
    fssaiLicense: product?.fssaiLicense ?? "",
    shelfLife: product?.shelfLife ?? "",
    ingredients: product?.ingredients ?? "",
    slug: product?.slug ?? "",
    isActive: product?.isActive ?? true,
  };
}

/** One store's row of a size's price and stock, as typed. */
export type StoreRowDraft = {
  price: string;
  mrp: string;
  selling: boolean;
  /** Stock as typed; saved as the difference from `stockLoaded`, so orders placed meanwhile are kept. */
  stock: string;
  stockLoaded: number;
  listed: boolean;
};

export type PriceDraft = {
  /** One price for every store. */
  same: boolean;
  price: string;
  mrp: string;
  stores: Record<string, StoreRowDraft>;
};

const amount = (value: string | null | undefined) => (value ? Number(value).toString() : "");

export function priceDraftFor(stores: Store[], listingFor: (storeId: string) => Listing | null): PriceDraft {
  const listings = stores.map((store) => listingFor(store.id));
  const listed = listings.filter((listing): listing is Listing => listing !== null);
  const first = listed[0];
  const allSame =
    listed.length === stores.length &&
    listed.every((listing) => listing.sellingPrice === first?.sellingPrice && listing.mrp === first?.mrp);
  return {
    same: stores.length <= 1 || listed.length === 0 || allSame,
    price: amount(first?.sellingPrice),
    mrp: amount(first?.mrp),
    stores: Object.fromEntries(
      stores.map((store, index) => {
        const listing = listings[index];
        return [
          store.id,
          {
            price: amount(listing?.sellingPrice),
            mrp: amount(listing?.mrp),
            selling: listing?.isAvailable ?? true,
            stock: String(listing?.stockQuantity ?? 0),
            stockLoaded: listing?.stockQuantity ?? 0,
            listed: Boolean(listing),
          },
        ];
      }),
    ),
  };
}

/** Price drafts for every saved size of a product, keyed by variant id. */
export function priceDraftsFromListings(listings: ProductListings): Record<string, PriceDraft> {
  const stores = listings.items.map((item) => item.store);
  return Object.fromEntries(
    listings.variants.map((variant) => [
      variant.id,
      priceDraftFor(stores, (storeId) => {
        const item = listings.items.find((candidate) => candidate.store.id === storeId);
        return item?.listings.find((entry) => entry.variantId === variant.id)?.listing ?? null;
      }),
    ]),
  );
}

export type PriceRow = { storeId: string; variantId: string; sellingPrice: string; mrp: string; isAvailable: boolean };
export type StockRow = { storeId: string; variantId: string; delta: number };

const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

/**
 * Turns a size's price draft into rows for the API, or field errors keyed
 * `price.<variantId>.<storeId|all>.<price|mrp|stock>`.
 */
export function priceRows(variantId: string, draft: PriceDraft, stores: Store[]) {
  const rows: PriceRow[] = [];
  const stock: StockRow[] = [];
  const errors: Record<string, string> = {};
  const key = (scope: string, field: string) => `price.${variantId}.${scope}.${field}`;

  function check(scope: string, price: string, mrp: string) {
    const p = price.trim();
    const m = mrp.trim();
    if (!PRICE_PATTERN.test(p) || Number(p) <= 0) errors[key(scope, "price")] = "Enter a price like 68 or 68.50";
    if (m && (!PRICE_PATTERN.test(m) || Number(m) <= 0)) errors[key(scope, "mrp")] = "Enter the MRP like 70, or leave it empty";
    else if (m && PRICE_PATTERN.test(p) && Number(m) < Number(p)) errors[key(scope, "mrp")] = "MRP can't be lower than your price";
  }

  if (draft.same && draft.price.trim() === "" && draft.mrp.trim() === "") {
    // No price yet: the size stays unlisted.
  } else if (draft.same) {
    check("all", draft.price, draft.mrp);
  }

  for (const store of stores) {
    const row = draft.stores[store.id];
    if (!row) continue;
    const price = draft.same ? draft.price : row.price;
    const mrp = draft.same ? draft.mrp : row.mrp;
    const willList = price.trim() !== "";
    if (!draft.same) {
      if (willList || row.mrp.trim()) check(store.id, row.price, row.mrp);
      else if (row.listed) errors[key(store.id, "price")] = "Enter a price, or turn off Selling";
    } else if (!willList && row.listed) {
      errors[key("all", "price")] = "Enter a price";
    }
    if (willList) {
      rows.push({ storeId: store.id, variantId, sellingPrice: price.trim(), mrp: mrp.trim(), isAvailable: row.selling });
    }

    const typed = row.stock.trim();
    if (typed === "" || !/^\d{1,7}$/.test(typed)) {
      errors[key(store.id, "stock")] = "Enter a whole number";
    } else if (Number(typed) !== row.stockLoaded) {
      if (!willList) errors[key(store.id, "stock")] = "Set a price first";
      else stock.push({ storeId: store.id, variantId, delta: Number(typed) - row.stockLoaded });
    }
  }
  return { rows, stock, errors };
}

/** Lowest–highest price of a size across stores, for summaries. */
export function priceRange(draft: PriceDraft | undefined) {
  if (!draft) return null;
  const prices = Object.values(draft.stores)
    .filter((row) => row.listed && row.price)
    .map((row) => Number(row.price));
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export const totalStock = (draft: PriceDraft | undefined) =>
  draft ? Object.values(draft.stores).reduce((sum, row) => sum + (row.listed ? row.stockLoaded : 0), 0) : 0;
