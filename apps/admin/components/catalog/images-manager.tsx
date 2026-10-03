"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { uploadImage } from "@/app/(dashboard)/actions";
import {
  addProductImage,
  deleteProductImage,
  reorderProductImages,
  setImageVariant,
} from "@/app/(dashboard)/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastResult } from "@/lib/action-toast";
import type { ProductDetail } from "@/lib/types";

const MAX_IMAGES = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";
const ALL_VARIANTS = "all";

/**
 * Product photos. Images shared by all variants come first in the customer app; a variant shows
 * its own images before the shared ones.
 */
export function ImagesManager({ product }: { product: ProductDetail }) {
  const { images, variants } = product;
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const hasVariants = variants.length > 1;
  const full = images.length >= MAX_IMAGES;

  function run(task: () => Promise<unknown>) {
    startTransition(async () => {
      await task();
    });
  }

  function upload(files: File[]) {
    const room = MAX_IMAGES - images.length;
    if (files.length > room) toast.error(`Only ${room} more ${room === 1 ? "image fits" : "images fit"}; the rest were skipped`);
    run(async () => {
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is larger than 10 MB`);
          continue;
        }
        const formData = new FormData();
        formData.set("file", file);
        const uploaded = await uploadImage(formData);
        if (!uploaded.ok) {
          toast.error(uploaded.error);
          continue;
        }
        const result = await addProductImage({ productId: product.id, url: uploaded.url, variantId: null });
        if (!result.ok) toast.error(result.error);
      }
      toast.success("Upload finished");
    });
  }

  function move(index: number, offset: -1 | 1) {
    const ids = images.map((image) => image.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    run(async () => toastResult(await reorderProductImages({ productId: product.id, imageIds: ids })));
  }

  return (
    <div className="flex flex-col gap-4">
      {images.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          No photos yet. The first photo is the one customers see in lists.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-2 rounded-md border p-2">
              <div className="relative aspect-square overflow-hidden rounded bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host */}
                <img src={image.url} alt={image.altText ?? ""} className="size-full object-cover" />
                {index === 0 && <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 text-xs font-medium">Main</span>}
              </div>
              {hasVariants && (
                <Select
                  value={image.variantId ?? ALL_VARIANTS}
                  disabled={pending}
                  onValueChange={(value) =>
                    run(async () =>
                      toastResult(
                        await setImageVariant({ productId: product.id, imageId: image.id, variantId: value === ALL_VARIANTS ? null : value }),
                      ),
                    )
                  }
                >
                  <SelectTrigger size="sm" className="w-full" aria-label="Shown for">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VARIANTS}>All variants</SelectItem>
                    {variants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.label || variant.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-7" disabled={pending || index === 0} aria-label="Move earlier" onClick={() => move(index, -1)}>
                  <ArrowLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={pending || index === images.length - 1}
                  aria-label="Move later"
                  onClick={() => move(index, 1)}
                >
                  <ArrowRight />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-7 text-destructive"
                  disabled={pending}
                  aria-label="Remove image"
                  onClick={() => run(async () => toastResult(await deleteProductImage({ productId: product.id, imageId: image.id })))}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={pending || full} onClick={() => fileInput.current?.click()}>
          {pending ? <Loader2 className="animate-spin" /> : <Upload />}
          Upload photos
        </Button>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const url = link.trim();
            if (!url) return;
            run(async () => {
              if (toastResult(await addProductImage({ productId: product.id, url, variantId: null }))) setLink("");
            });
          }}
        >
          <Input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="Or paste an image link" disabled={full} className="min-w-40" />
          <Button type="submit" variant="outline" size="icon" disabled={pending || full || !link.trim()} aria-label="Add image from link">
            <Link2 />
          </Button>
        </form>
      </div>
      <p className="text-xs text-muted-foreground">
        Up to {MAX_IMAGES} photos, 10 MB each. Square photos on a plain background look best.
        {hasVariants && " Pick a variant to show a photo only for it."}
      </p>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) upload(files);
        }}
      />
    </div>
  );
}
