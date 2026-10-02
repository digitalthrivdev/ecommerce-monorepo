import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
import type { CreateBrandInput, ListBrandsQuery, UpdateBrandInput } from "./brands.schemas.js";

export function createBrandsService(prisma: PrismaClient) {
  async function listBrands({ limit, offset, search, includeInactive }: ListBrandsQuery) {
    const where: Prisma.BrandWhereInput = {
      ...(!includeInactive && { isActive: true }),
      ...(search && { name: { contains: search, mode: "insensitive" } }),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.brand.findMany({
        where,
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
        include: { _count: { select: { products: true } } },
      }),
      prisma.brand.count({ where }),
    ]);

    // Product counts include inactive products, so they are only shown to admins.
    const items = rows.map(({ _count, ...brand }) => (includeInactive ? { ...brand, productCount: _count.products } : brand));

    return { items, total, limit, offset };
  }

  async function getBrand(id: string, options: { includeInactive: boolean }) {
    const brand = await prisma.brand.findFirst({ where: options.includeInactive ? { id } : { id, isActive: true } });

    if (!brand) {
      throw new AppError(404, "BRAND_NOT_FOUND", "Brand not found");
    }

    return brand;
  }

  async function createBrand({ slug, ...data }: CreateBrandInput) {
    const finalSlug = slug ?? slugify(data.name);

    if (!finalSlug) {
      throw new AppError(400, "INVALID_SLUG", "Could not derive a slug from the name; provide one");
    }

    return prisma.brand.create({ data: { ...data, slug: finalSlug } });
  }

  async function updateBrand(id: string, data: UpdateBrandInput) {
    const existing = await prisma.brand.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      throw new AppError(404, "BRAND_NOT_FOUND", "Brand not found");
    }

    return prisma.brand.update({ where: { id }, data });
  }

  return { listBrands, getBrand, createBrand, updateBrand };
}
