"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { DeleteProductsDialog } from "@/components/catalog/delete-products";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProductsTable({ products }: { products: ProductListItem[] }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  // Only rows on this page count; the choice from another page or filter is dropped.
  const selected = products.filter((product) => chosen.has(product.id)).map((product) => product.id);
  const all = selected.length === products.length;

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const clear = () => setChosen(new Set());

  return (
    <>
      {selected.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
          <div className="ml-auto">
            <DeleteProductsDialog
              ids={selected}
              label={selected.length === 1 ? "1 product" : `${selected.length} products`}
              size="sm"
              onDone={clear}
            />
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={all ? true : selected.length > 0 ? "indeterminate" : false}
                onCheckedChange={() => setChosen(all ? new Set() : new Set(products.map((product) => product.id)))}
                aria-label="Select all products on this page"
              />
            </TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Sizes</TableHead>
            <TableHead className="text-right">Stores</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id} data-state={chosen.has(product.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox checked={chosen.has(product.id)} onCheckedChange={() => toggle(product.id)} aria-label={`Select ${product.name}`} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
                      <img src={product.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageIcon className="size-4" />
                    )}
                  </div>
                  <div>
                    <Link href={`/products/${product.id}`} className="font-medium underline-offset-4 hover:underline">
                      {product.name}
                    </Link>
                    {product.brand && <div className="text-xs text-muted-foreground">{product.brand.name}</div>}
                  </div>
                </div>
              </TableCell>
              <TableCell>{product.category.name}</TableCell>
              <TableCell className="text-right tabular-nums">{product.variantCount}</TableCell>
              <TableCell className={cn("text-right tabular-nums", product.storeCount === 0 && "text-muted-foreground")}>
                {product.storeCount === 0 ? "Not selling" : product.storeCount}
              </TableCell>
              <TableCell>{product.isActive ? <Pill tone="green">In the app</Pill> : <Pill tone="gray">Hidden</Pill>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
