import type { PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "./categories.schemas.js";

export function createCategoriesService(prisma: PrismaClient) {
  async function listCategories(params: { limit: number; offset: number; includeInactive: boolean }) {
    const where = params.includeInactive ? {} : { isActive: true };

    const [items, total] = await prisma.$transaction([
      prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: params.limit,
        skip: params.offset,
      }),
      prisma.category.count({ where }),
    ]);

    return { items, total, limit: params.limit, offset: params.offset };
  }

  async function getCategory(id: string, options: { includeInactive: boolean }) {
    const category = await prisma.category.findFirst({
      where: options.includeInactive ? { id } : { id, isActive: true },
    });

    if (!category) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }

    return category;
  }

  async function createCategory({ slug, ...data }: CreateCategoryInput) {
    const finalSlug = slug ?? slugify(data.name);

    if (!finalSlug) {
      throw new AppError(400, "INVALID_SLUG", "Could not derive a slug from the name; provide one");
    }

    return prisma.category.create({ data: { ...data, slug: finalSlug } });
  }

  async function updateCategory(id: string, data: UpdateCategoryInput) {
    const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }

    return prisma.category.update({ where: { id }, data });
  }

  return { listCategories, getCategory, createCategory, updateCategory };
}
