import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./products.schemas.js";

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

export function createProductsService(prisma: PrismaClient) {
  async function assertCategoryExists(categoryId: string) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new AppError(400, "INVALID_CATEGORY", "Category does not exist");
    }
  }

  async function listProducts({ limit, offset, categoryId, search, includeInactive }: ListProductsQuery) {
    const where: Prisma.ProductWhereInput = {
      ...(includeInactive ? {} : { isActive: true, category: { isActive: true } }),
      ...(categoryId && { categoryId }),
      ...(search && { name: { contains: search, mode: "insensitive" } }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async function getProduct(id: string, options: { includeInactive: boolean }) {
    const product = await prisma.product.findFirst({
      where: options.includeInactive
        ? { id }
        : { id, isActive: true, category: { isActive: true } },
      include: productInclude,
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    return product;
  }

  async function createProduct({ slug, ...data }: CreateProductInput) {
    const finalSlug = slug ?? slugify(data.name);

    if (!finalSlug) {
      throw new AppError(400, "INVALID_SLUG", "Could not derive a slug from the name; provide one");
    }

    await assertCategoryExists(data.categoryId);

    return prisma.product.create({
      data: { ...data, slug: finalSlug },
      include: productInclude,
    });
  }

  async function updateProduct(id: string, data: UpdateProductInput) {
    const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    if (data.categoryId) {
      await assertCategoryExists(data.categoryId);
    }

    return prisma.product.update({ where: { id }, data, include: productInclude });
  }

  return { listProducts, getProduct, createProduct, updateProduct };
}
