import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
import { usedCategoryIds } from "../settings/appearance.service.js";
import type { CreateCategoryInput, ListCategoriesQuery, UpdateCategoryInput } from "./categories.schemas.js";

/** Active categories whose parent, for a sub-category, is active too. */
const customerVisibleCategory = {
  isActive: true,
  OR: [{ parentId: null }, { parent: { isActive: true } }],
} satisfies Prisma.CategoryWhereInput;

export function createCategoriesService(prisma: PrismaClient) {
  async function listCategories({ limit, offset, parentId, topLevel, includeInactive }: ListCategoriesQuery) {
    const where: Prisma.CategoryWhereInput = {
      ...(includeInactive ? {} : customerVisibleCategory),
      ...(parentId && { parentId }),
      ...(topLevel && { parentId: null }),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: {
              products: true,
              children: includeInactive ? true : { where: { isActive: true } },
            },
          },
        },
      }),
      prisma.category.count({ where }),
    ]);

    // Product counts include inactive products, so they are only shown to admins.
    const items = rows.map(({ _count, ...category }) => ({
      ...category,
      childCount: _count.children,
      ...(includeInactive && { productCount: _count.products }),
    }));

    return { items, total, limit, offset };
  }

  async function getCategory(id: string, options: { includeInactive: boolean }) {
    const category = await prisma.category.findFirst({
      where: options.includeInactive ? { id } : { id, ...customerVisibleCategory },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: options.includeInactive ? {} : { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, slug: true, imageUrl: true, isActive: true, sortOrder: true },
        },
      },
    });

    if (!category) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }

    return category;
  }

  /** Only two levels: the parent must be top-level, and a category with sub-categories cannot get a parent. */
  async function assertValidParent(parentId: string, categoryId?: string) {
    if (parentId === categoryId) {
      throw new AppError(400, "INVALID_PARENT", "A category cannot be its own parent");
    }

    const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) {
      throw new AppError(400, "INVALID_PARENT", "Parent category does not exist");
    }
    if (parent.parentId) {
      throw new AppError(400, "INVALID_PARENT", "Sub-categories cannot have sub-categories of their own");
    }

    if (categoryId) {
      const children = await prisma.category.count({ where: { parentId: categoryId } });
      if (children > 0) {
        throw new AppError(400, "INVALID_PARENT", "This category has sub-categories, so it must stay top-level");
      }
    }
  }

  async function createCategory({ slug, ...data }: CreateCategoryInput) {
    const finalSlug = slug ?? slugify(data.name);

    if (!finalSlug) {
      throw new AppError(400, "INVALID_SLUG", "Could not derive a slug from the name; provide one");
    }

    if (data.parentId) {
      await assertValidParent(data.parentId);
    }

    return prisma.category.create({ data: { ...data, slug: finalSlug } });
  }

  async function updateCategory(id: string, data: UpdateCategoryInput) {
    const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }

    if (data.parentId) {
      await assertValidParent(data.parentId, id);
    }

    return prisma.category.update({ where: { id }, data });
  }

  /** Only empty categories: products and sub-categories must be moved or deleted first. */
  async function deleteCategory(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { products: true, children: true } } },
    });

    if (!category) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    const { products, children } = category._count;
    if (children > 0) {
      throw new AppError(409, "CATEGORY_HAS_SUBCATEGORIES", `Delete or move its ${children === 1 ? "sub-category" : `${children} sub-categories`} first`);
    }
    if (products > 0) {
      throw new AppError(
        409,
        "CATEGORY_HAS_PRODUCTS",
        `Move its ${products === 1 ? "product" : `${products} products`} to another category or delete ${products === 1 ? "it" : "them"} first. Hidden products count too.`,
      );
    }
    if ((await usedCategoryIds(prisma)).has(id)) {
      throw new AppError(409, "CATEGORY_IN_USE", "It's used on the home screen or as a category tab. Remove it in Appearance first.");
    }

    try {
      await prisma.category.delete({ where: { id } });
    } catch (error) {
      // A product or sub-category added to it while this ran.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new AppError(409, "CATEGORY_HAS_PRODUCTS", "Something was just added to this category. Try again.");
      }
      throw error;
    }
    return { id: category.id, name: category.name };
  }

  return { listCategories, getCategory, createCategory, updateCategory, deleteCategory };
}
