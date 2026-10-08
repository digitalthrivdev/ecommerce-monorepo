import { InventoryAdjustmentReason, Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
import { setStock } from "../inventory/inventory.service.js";
import { MAX_OPTION_VALUES, MAX_OPTIONS, MAX_VARIANTS, type VariantsInput } from "../products/products.schemas.js";
import { saveVariants, validateVariants } from "../products/variants.js";
import {
  COLUMNS,
  MAX_FILE_BYTES,
  MAX_ROWS,
  OPTION_SLOTS,
  PRODUCT_COLUMNS,
  REQUIRED_COLUMNS,
  rowSchema,
  type Column,
  type ImportRow,
} from "./catalog-import.schemas.js";
import { parseCsv, toCsv } from "./csv.js";

type Db = Prisma.TransactionClient;

/** `row` is the spreadsheet row (the header is row 1); null for problems with the whole file. */
export type RowError = { row: number | null; column: string | null; message: string };

type ParsedRow = { row: number; data: ImportRow; raw: Partial<Record<Column, string | null>> };
/** A product's first row, which defines the product. */
type ProductRow = ParsedRow & { data: ImportRow & { name: string; category: string } };

/** The rows of one product, grouped by product_handle or else by name and brand. */
export type ProductGroup = {
  first: ProductRow;
  rows: ParsedRow[];
  existingId: string | null;
  /** For a new product. */
  slug: string | null;
  createsVariants: number;
};

export type ImportPlan = {
  store: { id: string; name: string };
  columns: Set<Column>;
  groups: ProductGroup[];
  rowCount: number;
  categoriesToCreate: string[];
  brandsToCreate: string[];
  errors: RowError[];
};

export type ImportResult = {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  categoriesCreated: number;
  brandsCreated: number;
  stockChanged: number;
  imagesAdded: number;
  imagesSkipped: number;
  imagesFailed: number;
  /** Products that could not be saved; nothing of them was written. */
  failedProducts: RowError[];
  /** Images that could not be added. */
  warnings: RowError[];
};

export type WrittenProduct = {
  group: ProductGroup;
  productId: string;
  created: boolean;
  variantsCreated: number;
  variantsUpdated: number;
  stockChanged: number;
  variantIdBySku: Map<string, string>;
  hasOptions: boolean;
};

/** Errors listed in a response; the total is reported separately. */
const MAX_LISTED_ERRORS = 500;
const BATCH_SIZE = 25;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 };

const key = (value: string) => value.toLowerCase();
const has = (columns: Set<Column>, column: Column) => columns.has(column);

const TEMPLATE_ROWS: Partial<Record<Column, string>>[] = [
  {
    product_handle: "parle-g-original-biscuits",
    name: "Parle-G Original Glucose Biscuits",
    brand: "Parle",
    category: "Snacks & Biscuits",
    subcategory: "Biscuits",
    description: "Classic glucose biscuits",
    tags: "biscuit, glucose",
    hsn_code: "1905",
    gst_rate: "18",
    is_veg: "yes",
    option1_name: "Size",
    option1_value: "250 g",
    sku: "PARLEG-250G",
    pack_quantity: "250",
    unit: "g",
    max_order_quantity: "10",
    price: "25.00",
    mrp: "25.00",
    available: "yes",
    stock: "120",
    image_url: "",
  },
  {
    product_handle: "parle-g-original-biscuits",
    name: "Parle-G Original Glucose Biscuits",
    option1_name: "Size",
    option1_value: "800 g",
    sku: "PARLEG-800G",
    pack_quantity: "800",
    unit: "g",
    max_order_quantity: "5",
    price: "76.00",
    mrp: "80.00",
    available: "yes",
    stock: "",
  },
  {
    product_handle: "tata-salt",
    name: "Tata Salt",
    brand: "Tata",
    category: "Staples",
    subcategory: "Salt & Sugar",
    description: "Iodised salt",
    tags: "salt, namak",
    hsn_code: "2501",
    gst_rate: "5",
    is_veg: "yes",
    sku: "TATA-SALT-1KG",
    pack_quantity: "1",
    unit: "kg",
    price: "28.00",
    mrp: "30.00",
    available: "yes",
    stock: "60",
  },
];

export function importTemplate() {
  return toCsv([[...COLUMNS], ...TEMPLATE_ROWS.map((row) => COLUMNS.map((column) => row[column] ?? ""))]);
}

function optionPairs(data: ImportRow) {
  return OPTION_SLOTS.flatMap(([nameColumn, valueColumn]) => {
    const name = data[nameColumn];
    const value = data[valueColumn];
    return name && value ? [{ name, value }] : [];
  });
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Reads the header and rows and validates each row on its own. */
function readRows(csv: string) {
  const errors: RowError[] = [];
  const empty = { columns: new Set<Column>(), rows: [] as ParsedRow[], rowCount: 0, errors };

  if (Buffer.byteLength(csv, "utf8") > MAX_FILE_BYTES) {
    throw new AppError(413, "FILE_TOO_LARGE", `The file can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  }

  let records: string[][];
  try {
    records = parseCsv(csv);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    errors.push({ row: null, column: null, message: error.message });
    return empty;
  }

  const [header, ...body] = records;
  if (!header || header.every((cell) => cell.trim() === "")) {
    errors.push({ row: null, column: null, message: "The file is empty" });
    return empty;
  }

  const columnAt = new Map<number, Column>();
  for (const [index, cell] of header.entries()) {
    const name = normalizeHeader(cell);
    if (!name) {
      if (body.some((record) => (record[index] ?? "").trim() !== "")) {
        errors.push({ row: 1, column: null, message: `Column ${index + 1} has values but no header` });
      }
      continue;
    }
    if (!(COLUMNS as readonly string[]).includes(name)) {
      const hint = header.length === 1 && /[;\t]/.test(cell) ? ". Save the file as CSV (comma-separated)" : "";
      errors.push({ row: 1, column: cell.trim(), message: `Unknown column "${cell.trim()}"${hint}` });
      continue;
    }
    if ([...columnAt.values()].includes(name as Column)) {
      errors.push({ row: 1, column: name, message: `Column "${name}" appears twice` });
      continue;
    }
    columnAt.set(index, name as Column);
  }
  const columns = new Set(columnAt.values());
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.has(column)) errors.push({ row: 1, column, message: `Missing required column "${column}"` });
  }
  if (errors.length > 0) return empty;

  const dataRows = body.map((record, index) => ({ row: index + 2, record })).filter(({ record }) => record.some((cell) => cell.trim() !== ""));
  if (dataRows.length === 0) {
    errors.push({ row: null, column: null, message: "The file has no product rows" });
    return empty;
  }
  if (dataRows.length > MAX_ROWS) {
    errors.push({ row: null, column: null, message: `The file has ${dataRows.length} rows; import at most ${MAX_ROWS.toLocaleString("en-IN")} at a time` });
    return empty;
  }

  const rows: ParsedRow[] = [];
  for (const { row, record } of dataRows) {
    if (record.slice(header.length).some((cell) => cell.trim() !== "")) {
      errors.push({ row, column: null, message: "This row has more values than the file has columns" });
      continue;
    }
    const raw: Partial<Record<Column, string | null>> = {};
    for (const [index, column] of columnAt) {
      const value = (record[index] ?? "").trim();
      raw[column] = value === "" ? null : value;
    }
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row, column: issue.path[0] ? String(issue.path[0]) : null, message: issue.message });
      }
      continue;
    }
    rows.push({ row, data: parsed.data, raw });
  }

  return { columns, rows, rowCount: dataRows.length, errors };
}

/** Groups rows into products and checks that each product's rows agree with each other. */
function groupRows(rows: ParsedRow[], errors: RowError[]) {
  const groups = new Map<string, ProductGroup>();
  const skuRow = new Map<string, number>();

  for (const row of rows) {
    const { data } = row;
    const firstRow = skuRow.get(data.sku);
    if (firstRow !== undefined) {
      errors.push({ row: row.row, column: "sku", message: `SKU ${data.sku} is also on row ${firstRow}` });
      continue;
    }
    skuRow.set(data.sku, row.row);

    if (!data.product_handle && !data.name) {
      errors.push({ row: row.row, column: "name", message: "Required (or give a product_handle)" });
      continue;
    }
    const groupKey = data.product_handle ? `handle:${data.product_handle}` : `name:${key(data.name!)}\u0000${key(data.brand ?? "")}`;
    const group = groups.get(groupKey);
    if (!group) {
      const missing = (["name", "category"] as const).filter((column) => !data[column]);
      for (const column of missing) {
        errors.push({ row: row.row, column, message: "Required on a product's first row" });
      }
      if (missing.length === 0) {
        groups.set(groupKey, { first: row as ProductRow, rows: [row], existingId: null, slug: null, createsVariants: 0 });
      }
      continue;
    }

    let consistent = true;
    for (const column of PRODUCT_COLUMNS) {
      const value = row.raw[column];
      if (value != null && key(value) !== key(group.first.raw[column] ?? "")) {
        errors.push({ row: row.row, column, message: `Differs from row ${group.first.row}, this product's first row: leave it blank or make it the same` });
        consistent = false;
      }
    }
    const optionNames = (target: ParsedRow) => optionPairs(target.data).map((pair) => key(pair.name)).join(", ");
    if (optionNames(row) !== optionNames(group.first)) {
      const expected = optionPairs(group.first.data).map((pair) => pair.name).join(", ");
      errors.push({
        row: row.row,
        column: "option1_name",
        message: expected
          ? `Use the same options as row ${group.first.row}: ${expected}`
          : `Row ${group.first.row} has this product without options. Give every row of the product the same options, or give this row its own product_handle.`,
      });
      consistent = false;
    } else if (!optionNames(row)) {
      errors.push({
        row: row.row,
        column: "option1_name",
        message: `Row ${group.first.row} is already this product without options. Give its rows an option such as Size, or give this row its own product_handle.`,
      });
      consistent = false;
    }
    if (consistent) group.rows.push(row);
  }

  return [...groups.values()];
}

type ExistingProduct = {
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    sku: string;
    barcode: string | null;
    unit: string | null;
    quantity: string | null;
    maxOrderQuantity: number | null;
    /** Option name in lower case → value. */
    values: Map<string, string>;
  }[];
};

async function loadExisting(db: Db, productIds: string[]) {
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      options: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, values: { orderBy: { sortOrder: "asc" }, select: { value: true } } },
      },
      variants: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          sku: true,
          barcode: true,
          unit: true,
          quantity: true,
          maxOrderQuantity: true,
          optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
        },
      },
    },
  });

  return new Map<string, ExistingProduct>(
    products.map((product) => [
      product.id,
      {
        options: product.options.map((option) => ({ name: option.name, values: option.values.map((value) => value.value) })),
        variants: product.variants.map(({ optionValues, quantity, ...variant }) => ({
          ...variant,
          quantity: quantity?.toString() ?? null,
          values: new Map(optionValues.map(({ optionValue }) => [key(optionValue.option.name), optionValue.value])),
        })),
      },
    ]),
  );
}

/**
 * The product's full set of options and variants after the import: its current variants, updated
 * from the file where the SKU matches, followed by the file's new variants. Option axes are matched
 * by name; new axes and values are added.
 */
function mergeVariants(existing: ExistingProduct | undefined, group: ProductGroup, columns: Set<Column>) {
  const errors: RowError[] = [];
  const axes = (existing?.options ?? []).map((option) => ({ name: option.name, values: [...option.values] }));
  const axisFor = (name: string) => {
    let axis = axes.find((candidate) => key(candidate.name) === key(name));
    if (!axis) {
      axis = { name, values: [] };
      axes.push(axis);
    }
    return axis;
  };
  for (const pair of optionPairs(group.first.data)) axisFor(pair.name);

  const fileRow = new Map(group.rows.map((row) => [row.data.sku, row]));
  const column = <T>(row: ParsedRow | undefined, name: Column, value: T | null | undefined, current: T | null): T | null =>
    row && has(columns, name) ? (value ?? null) : current;

  type Draft = { row: number; inFile: boolean; values: Map<string, string>; variant: Omit<VariantsInput["variants"][number], "optionValues"> };
  const drafts: Draft[] = (existing?.variants ?? []).map((variant) => {
    const row = fileRow.get(variant.sku);
    const values = new Map(variant.values);
    for (const pair of row ? optionPairs(row.data) : []) values.set(key(pair.name), pair.value);
    return {
      row: row?.row ?? group.first.row,
      inFile: Boolean(row),
      values,
      variant: {
        id: variant.id,
        sku: variant.sku,
        barcode: column(row, "barcode", row?.data.barcode, variant.barcode),
        unit: column(row, "unit", row?.data.unit, variant.unit),
        quantity: column(row, "pack_quantity", row?.data.pack_quantity, variant.quantity),
        maxOrderQuantity: column(row, "max_order_quantity", row?.data.max_order_quantity, variant.maxOrderQuantity),
      },
    };
  });
  const existingSkus = new Set(existing?.variants.map((variant) => variant.sku));
  const newRows = group.rows.filter((row) => !existingSkus.has(row.data.sku));
  for (const row of newRows) {
    drafts.push({
      row: row.row,
      inFile: true,
      values: new Map(optionPairs(row.data).map((pair) => [key(pair.name), pair.value])),
      variant: {
        sku: row.data.sku,
        barcode: row.data.barcode ?? null,
        unit: row.data.unit ?? null,
        quantity: row.data.pack_quantity ?? null,
        maxOrderQuantity: row.data.max_order_quantity ?? null,
      },
    });
  }

  const axisNames = axes.map((axis) => axis.name).join(", ");
  if (axes.length > MAX_OPTIONS) {
    errors.push({ row: group.first.row, column: "option1_name", message: `A product has at most ${MAX_OPTIONS} options; this one would have ${axisNames}` });
    return { errors };
  }

  const variants: VariantsInput["variants"] = drafts.map((draft) => {
    const optionValues = axes.map((axis) => {
      const value = draft.values.get(key(axis.name));
      if (!value) {
        errors.push({
          row: draft.row,
          column: draft.inFile ? "option1_name" : null,
          message: draft.inFile
            ? `Give a ${axis.name} value: this product's variants vary by ${axisNames}`
            : `The product's variant ${draft.variant.sku} has no ${axis.name}; add a row for it with its ${axis.name}`,
        });
        return "";
      }
      const known = axis.values.find((candidate) => key(candidate) === key(value));
      if (known) return known;
      axis.values.push(value);
      return value;
    });
    return { ...draft.variant, optionValues };
  });

  if (variants.length > MAX_VARIANTS) {
    errors.push({ row: group.first.row, column: "sku", message: `A product has at most ${MAX_VARIANTS} variants` });
  }
  for (const axis of axes) {
    if (axis.values.length > MAX_OPTION_VALUES) {
      errors.push({ row: group.first.row, column: "option1_value", message: `${axis.name} can have at most ${MAX_OPTION_VALUES} values` });
    }
  }
  if (errors.length > 0) return { errors };

  const input: VariantsInput = { options: axes, variants };
  try {
    validateVariants(input);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    errors.push({ row: group.first.row, column: null, message: `${group.first.data.name}: ${error.message}` });
    return { errors };
  }
  return { errors, input, created: newRows.length, updated: group.rows.length - newRows.length };
}

function uniqueSlug(candidates: string[], taken: Set<string>, fallback: string) {
  const bases = candidates.map((candidate) => slugify(candidate).slice(0, 90).replace(/-+$/, "")).filter(Boolean);
  for (const base of bases) {
    if (!taken.has(base)) {
      taken.add(base);
      return base;
    }
  }
  const base = bases[0] ?? fallback;
  for (let n = 2; ; n++) {
    const slug = `${base}-${n}`;
    if (!taken.has(slug)) {
      taken.add(slug);
      return slug;
    }
  }
}

const categoryLabel = (data: ProductRow["data"]) => (data.subcategory ? `${data.category} › ${data.subcategory}` : data.category);

export function createCatalogImportService(prisma: PrismaClient) {
  async function findStore(storeId: string) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
    return store;
  }

  /** Validates the whole file against the catalog without saving anything. */
  async function plan(storeId: string, csv: string): Promise<ImportPlan> {
    const store = await findStore(storeId);
    const { columns, rows, rowCount, errors } = readRows(csv);
    const result: ImportPlan = { store, columns, groups: [], rowCount, categoriesToCreate: [], brandsToCreate: [], errors };
    if (rows.length === 0) return result;

    const groups = groupRows(rows, errors);
    const skus = groups.flatMap((group) => group.rows.map((row) => row.data.sku));

    const [owners, products, categories, brands] = await Promise.all([
      prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { sku: true, productId: true } }),
      prisma.product.findMany({ select: { id: true, name: true, slug: true, brand: { select: { name: true } } } }),
      prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
      prisma.brand.findMany({ select: { name: true } }),
    ]);

    // Which existing product each group updates.
    const ownerOf = new Map(owners.map((owner) => [owner.sku, owner.productId]));
    const bySlug = new Map(products.map((product) => [product.slug, product.id]));
    const byNameAndBrand = new Map<string, string[]>();
    for (const product of products) {
      const nameKey = `${key(product.name)}\u0000${key(product.brand?.name ?? "")}`;
      byNameAndBrand.set(nameKey, [...(byNameAndBrand.get(nameKey) ?? []), product.id]);
    }
    const claimedBy = new Map<string, ProductGroup>();
    const resolved: ProductGroup[] = [];
    for (const group of groups) {
      const { data } = group.first;
      const productIds = new Set(group.rows.flatMap((row) => ownerOf.get(row.data.sku) ?? []));
      let productId: string | undefined;
      if (productIds.size > 1) {
        errors.push({ row: group.first.row, column: "sku", message: `The SKUs of ${data.name} belong to different existing products` });
        continue;
      } else if (productIds.size === 1) {
        productId = [...productIds][0];
      } else if (data.product_handle) {
        productId = bySlug.get(data.product_handle);
      } else {
        const matches = byNameAndBrand.get(`${key(data.name)}\u0000${key(data.brand ?? "")}`) ?? [];
        if (matches.length > 1) {
          errors.push({ row: group.first.row, column: "name", message: `Several products are already called ${data.name}; add a product_handle column to say which one` });
          continue;
        }
        productId = matches[0];
      }
      if (productId) {
        const other = claimedBy.get(productId);
        if (other) {
          errors.push({ row: group.first.row, column: null, message: `Rows ${other.first.row} and ${group.first.row} update the same product; give them the same product_handle` });
          continue;
        }
        claimedBy.set(productId, group);
        group.existingId = productId;
      }
      // Without a gst_rate column an existing product keeps its rate; a new one, or a blank cell, has none.
      if (has(columns, "gst_rate") ? !data.gst_rate : !productId) {
        errors.push({ row: group.first.row, column: "gst_rate", message: "Required: the product's GST rate, e.g. 0, 5 or 18" });
        continue;
      }
      resolved.push(group);
    }

    // Variants, merged with the existing ones.
    const existing = await loadExisting(prisma, [...claimedBy.keys()]);
    const valid: ProductGroup[] = [];
    for (const group of resolved) {
      const merged = mergeVariants(group.existingId ? existing.get(group.existingId) : undefined, group, columns);
      errors.push(...merged.errors);
      if (!merged.input) continue;
      group.createsVariants = merged.created;
      valid.push(group);
    }

    // Without an mrp column, the saved MRP stays, so the new price must not exceed it.
    if (!has(columns, "mrp")) {
      const priceRow = new Map(valid.flatMap((group) => group.rows.map((row) => [row.data.sku, row] as const)));
      const listings = await prisma.storeProduct.findMany({
        where: { storeId, mrp: { not: null }, variant: { sku: { in: [...priceRow.keys()] } } },
        select: { mrp: true, variant: { select: { sku: true } } },
      });
      for (const listing of listings) {
        const row = priceRow.get(listing.variant.sku)!;
        if (listing.mrp!.lt(row.data.price)) {
          errors.push({ row: row.row, column: "price", message: `Above the MRP saved at this store (${listing.mrp!.toFixed(2)}); add an mrp column` });
        }
      }
    }

    // Categories: at most two levels, so a "category" must be top-level.
    const topByName = new Map<string, (typeof categories)[number]>();
    const subByName = new Map<string, (typeof categories)[number]>();
    for (const category of categories) {
      const target = category.parentId ? subByName : topByName;
      if (!target.has(key(category.name))) target.set(key(category.name), category);
    }
    const nameOf = new Map(categories.map((category) => [category.id, category.name]));
    const fileSubcategories = new Set(valid.flatMap((group) => (group.first.data.subcategory ? [key(group.first.data.subcategory)] : [])));
    const newCategories = new Map<string, string>();
    for (const group of valid) {
      const { category, subcategory } = group.first.data;
      const top = topByName.get(key(category));
      if (!top) {
        const sub = subByName.get(key(category));
        if (sub) {
          const parent = nameOf.get(sub.parentId!);
          errors.push({
            row: group.first.row,
            column: "category",
            message: `"${category}" is a sub-category of "${parent}". Categories are at most two levels deep: put "${parent}" in category and "${category}" in subcategory.`,
          });
          continue;
        }
        if (fileSubcategories.has(key(category))) {
          errors.push({
            row: group.first.row,
            column: "category",
            message: `"${category}" is also used as a subcategory in this file. Categories are at most two levels deep.`,
          });
          continue;
        }
        newCategories.set(key(category), category);
      }
      if (subcategory && !(top && categories.some((candidate) => candidate.parentId === top.id && key(candidate.name) === key(subcategory)))) {
        newCategories.set(`${key(category)}\u0000${key(subcategory)}`, categoryLabel(group.first.data));
      }
    }

    const brandNames = new Set(brands.map((brand) => key(brand.name)));
    const newBrands = new Map<string, string>();
    for (const group of valid) {
      const brand = group.first.data.brand;
      if (brand && !brandNames.has(key(brand))) newBrands.set(key(brand), brand);
    }

    // Web addresses for new products; handles first, as they must stay exactly the handle.
    const taken = new Set(products.map((product) => product.slug));
    const fresh = valid.filter((group) => !group.existingId);
    for (const group of [...fresh.filter((g) => g.first.data.product_handle), ...fresh.filter((g) => !g.first.data.product_handle)]) {
      const { data } = group.first;
      group.slug = uniqueSlug(data.product_handle ? [data.product_handle] : [data.name, `${data.brand ?? ""} ${data.name}`], taken, "product");
    }

    result.groups = valid;
    result.categoriesToCreate = [...newCategories.values()];
    result.brandsToCreate = [...newBrands.values()];
    result.errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
    return result;
  }

  function summarize(plan: ImportPlan) {
    const updates = plan.groups.filter((group) => group.existingId);
    const variantRows = plan.groups.flatMap((group) => group.rows);
    const created = plan.groups.reduce((sum, group) => sum + group.createsVariants, 0);
    return {
      store: plan.store,
      rows: plan.rowCount,
      products: { create: plan.groups.length - updates.length, update: updates.length },
      variants: { create: created, update: variantRows.length - created },
      categories: { create: plan.categoriesToCreate },
      brands: { create: plan.brandsToCreate },
      stockRows: variantRows.filter((row) => row.data.stock != null).length,
      imageRows: variantRows.filter((row) => row.data.image_url).length,
      errors: plan.errors.slice(0, MAX_LISTED_ERRORS),
      errorCount: plan.errors.length,
    };
  }

  /** Creates the categories and brands the file names that don't exist yet; returns ids by name. */
  async function prepareReferences(plan: ImportPlan) {
    return prisma.$transaction(async (tx) => {
      const categories = await tx.category.findMany({ select: { id: true, name: true, slug: true, parentId: true } });
      const brands = await tx.brand.findMany({ select: { id: true, name: true, slug: true } });
      const categorySlugs = new Set(categories.map((category) => category.slug));
      const brandSlugs = new Set(brands.map((brand) => brand.slug));
      const categoryIds = new Map<string, string>();
      const brandIds = new Map(brands.map((brand) => [key(brand.name), brand.id]));
      let categoriesCreated = 0;
      let brandsCreated = 0;

      for (const group of plan.groups) {
        const { category, subcategory, brand } = group.first.data;
        const topKey = key(category);
        let topId = categoryIds.get(topKey) ?? categories.find((c) => !c.parentId && key(c.name) === topKey)?.id;
        if (!topId) {
          topId = (await tx.category.create({ data: { name: category, slug: uniqueSlug([category], categorySlugs, "category") }, select: { id: true } })).id;
          categoriesCreated++;
        }
        categoryIds.set(topKey, topId);

        if (subcategory) {
          const subKey = `${topKey}\u0000${key(subcategory)}`;
          let subId = categoryIds.get(subKey) ?? categories.find((c) => c.parentId === topId && key(c.name) === key(subcategory))?.id;
          if (!subId) {
            const slug = uniqueSlug([subcategory, `${category} ${subcategory}`], categorySlugs, "category");
            subId = (await tx.category.create({ data: { name: subcategory, slug, parentId: topId }, select: { id: true } })).id;
            categoriesCreated++;
          }
          categoryIds.set(subKey, subId);
        }

        if (brand && !brandIds.has(key(brand))) {
          const created = await tx.brand.create({ data: { name: brand, slug: uniqueSlug([brand], brandSlugs, "brand") }, select: { id: true } });
          brandIds.set(key(brand), created.id);
          brandsCreated++;
        }
      }

      return { categoryIds, brandIds, categoriesCreated, brandsCreated };
    }, TRANSACTION_OPTIONS);
  }

  type References = Awaited<ReturnType<typeof prepareReferences>>;
  type WriteContext = { plan: ImportPlan; refs: References; changedById: string };

  function productData(group: ProductGroup, { plan, refs }: WriteContext) {
    const { data } = group.first;
    const columns = plan.columns;
    const categoryKey = data.subcategory ? `${key(data.category)}\u0000${key(data.subcategory)}` : key(data.category);
    const set = <T>(column: Column, value: T) => (has(columns, column) ? value : undefined);
    return {
      name: data.name,
      categoryId: refs.categoryIds.get(categoryKey)!,
      brandId: set("brand", data.brand ? refs.brandIds.get(key(data.brand))! : null),
      description: set("description", data.description ?? null),
      tags: set("tags", data.tags ?? []),
      hsnCode: set("hsn_code", data.hsn_code ?? null),
      gstRate: set("gst_rate", data.gst_rate ?? null),
      isVeg: set("is_veg", data.is_veg ?? null),
      manufacturerName: set("manufacturer_name", data.manufacturer_name ?? null),
      manufacturerAddress: set("manufacturer_address", data.manufacturer_address ?? null),
      countryOfOrigin: set("country_of_origin", data.country_of_origin ?? null),
      fssaiLicense: set("fssai_license", data.fssai_license ?? null),
      shelfLife: set("shelf_life", data.shelf_life ?? null),
      ingredients: set("ingredients", data.ingredients ?? null),
    };
  }

  /** Writes one product, its variants, store listings and stock. Must run inside a transaction. */
  async function writeProduct(tx: Db, group: ProductGroup, context: WriteContext): Promise<WrittenProduct> {
    const { plan, changedById } = context;
    const data = productData(group, context);
    let productId: string;
    let existing: ExistingProduct | undefined;

    if (group.existingId) {
      productId = group.existingId;
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
      if (locked.length === 0) throw new AppError(409, "PRODUCT_NOT_FOUND", "The product was deleted during the import");
      await tx.product.update({ where: { id: productId }, data });
      // Re-read under the lock: the product may have changed since the file was checked.
      existing = (await loadExisting(tx, [productId])).get(productId);
    } else {
      productId = (await tx.product.create({ data: { ...data, slug: group.slug! }, select: { id: true } })).id;
    }

    const merged = mergeVariants(existing, group, plan.columns);
    if (!merged.input) throw new AppError(409, "IMPORT_CONFLICT", merged.errors[0]?.message ?? "The product changed during the import");
    await saveVariants(tx, productId, merged.input);

    const variants = await tx.productVariant.findMany({
      where: { productId, sku: { in: group.rows.map((row) => row.data.sku) } },
      select: { id: true, sku: true },
    });
    const variantIdBySku = new Map(variants.map((variant) => [variant.sku, variant.id]));

    let stockChanged = 0;
    for (const { row, data: rowData } of group.rows) {
      const variantId = variantIdBySku.get(rowData.sku)!;
      const listing = await tx.storeProduct.findUnique({
        where: { storeId_variantId: { storeId: plan.store.id, variantId } },
        select: { id: true, mrp: true },
      });
      const mrp = has(plan.columns, "mrp") ? (rowData.mrp ?? null) : (listing?.mrp ?? null);
      if (mrp !== null && new Prisma.Decimal(mrp).lt(rowData.price)) {
        throw new AppError(409, "MRP_BELOW_PRICE", `Row ${row}: the price is above the MRP`);
      }
      const listingData = { sellingPrice: rowData.price, mrp, ...(rowData.available != null && { isAvailable: rowData.available }) };
      const storeProductId = listing
        ? (await tx.storeProduct.update({ where: { id: listing.id }, data: listingData, select: { id: true } })).id
        : (await tx.storeProduct.create({ data: { storeId: plan.store.id, variantId, ...listingData }, select: { id: true } })).id;

      if (rowData.stock != null) {
        const before = await setStock(tx, storeProductId, rowData.stock, {
          reason: InventoryAdjustmentReason.CORRECTION,
          note: "CSV import",
          changedById,
        });
        if (before !== rowData.stock) stockChanged++;
      }
    }

    return {
      group,
      productId,
      created: !group.existingId,
      variantsCreated: merged.created,
      variantsUpdated: merged.updated,
      stockChanged,
      variantIdBySku,
      hasOptions: merged.input.options.length > 0,
    };
  }

  function failureMessage(error: unknown) {
    if (error instanceof AppError) return error.message;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "Another product took this SKU or web address during the import";
    }
    return undefined;
  }

  /**
   * Writes the plan's products in transactions of up to 25 products. If a batch fails, its products
   * are retried one per transaction, so one bad product never leaves another half-written.
   */
  async function writeProducts(
    plan: ImportPlan,
    refs: References,
    changedById: string,
    onBatch: (done: number, written: WrittenProduct[], failed: RowError[]) => Promise<void>,
    log: (error: unknown) => void,
  ) {
    const context: WriteContext = { plan, refs, changedById };
    for (let start = 0; start < plan.groups.length; start += BATCH_SIZE) {
      const batch = plan.groups.slice(start, start + BATCH_SIZE);
      const written: WrittenProduct[] = [];
      const failed: RowError[] = [];
      try {
        written.push(
          ...(await prisma.$transaction(async (tx) => {
            const results: WrittenProduct[] = [];
            for (const group of batch) results.push(await writeProduct(tx, group, context));
            return results;
          }, TRANSACTION_OPTIONS)),
        );
      } catch {
        for (const group of batch) {
          try {
            written.push(await prisma.$transaction((tx) => writeProduct(tx, group, context), TRANSACTION_OPTIONS));
          } catch (error) {
            const message = failureMessage(error);
            if (!message) log(error);
            failed.push({ row: group.first.row, column: null, message: `${group.first.data.name}: ${message ?? "could not be saved"}` });
          }
        }
      }
      await onBatch(start + batch.length, written, failed);
    }
  }

  return { plan, summarize, prepareReferences, writeProducts };
}

export type CatalogImportService = ReturnType<typeof createCatalogImportService>;
