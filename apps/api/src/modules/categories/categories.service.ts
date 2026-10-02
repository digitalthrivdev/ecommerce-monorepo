import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
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

  return { listCategories, getCategory, createCategory, updateCategory };
}
