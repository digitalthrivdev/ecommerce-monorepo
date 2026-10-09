"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteCategory } from "@/app/(dashboard)/categories/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/lib/action-toast";
import type { Category } from "@/lib/types";

export function DeleteCategoryButton({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const products = category.productCount ?? 0;
  const blocker =
    category.childCount > 0
      ? `It has ${category.childCount === 1 ? "a sub-category" : `${category.childCount} sub-categories`}. Delete or move ${category.childCount === 1 ? "it" : "them"} first.`
      : products > 0
        ? `It has ${products === 1 ? "a product" : `${products} products`}. Move ${products === 1 ? "it" : "them"} to another category or delete ${products === 1 ? "it" : "them"} first.`
        : null;

  function submit() {
    startTransition(async () => {
      if (toastResult(await deleteCategory(category.id))) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${category.name}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocker ? `${category.name} can't be deleted yet` : `Delete ${category.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocker ?? "It's removed from the dashboard and the customer app. To keep it for later, hide it instead. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{blocker ? "OK" : "Keep"}</AlertDialogCancel>
          {!blocker && (
            <Button variant="destructive" disabled={pending} onClick={submit}>
              {pending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
