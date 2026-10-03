import type { Category } from "./types";

export type CategoryNode = Category & { children: Category[] };

/** Top-level categories with their sub-categories, keeping the API's order. */
export function categoryTree(categories: Category[]): CategoryNode[] {
  const ids = new Set(categories.map((category) => category.id));
  const roots = categories
    .filter((category) => !category.parentId || !ids.has(category.parentId))
    .map((category) => ({ ...category, children: [] as Category[] }));
  const byId = new Map(roots.map((root) => [root.id, root]));
  for (const category of categories) {
    if (category.parentId) byId.get(category.parentId)?.children.push(category);
  }
  return roots;
}

/** Flattened tree for pickers: each sub-category directly after its parent. */
export function categoryOptions(categories: Category[]) {
  return categoryTree(categories).flatMap((root) => [
    { category: root as Category, depth: 0 },
    ...root.children.map((child) => ({ category: child, depth: 1 })),
  ]);
}
