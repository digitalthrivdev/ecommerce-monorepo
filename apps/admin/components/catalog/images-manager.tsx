"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Loader2, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

const MAX_IMAGES = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";
const ALL_VARIANTS = "all";

/** Photos for a product not saved yet: uploaded now, added to the product when it is saved. */
export function DraftImages({ urls, onChange }: { urls: string[]; onChange: (urls: string[]) => void }) {
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const full = urls.length >= MAX_IMAGES;

  function upload(files: File[]) {
    const room = MAX_IMAGES - urls.length;
    if (files.length > room) toast.error(`Only ${room} more ${room === 1 ? "image fits" : "images fit"}; the rest were skipped`);
    startTransition(async () => {
      const added: string[] = [];
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is larger than 10 MB`);
          continue;
        }
        const formData = new FormData();
        formData.set("file", file);
        const uploaded = await uploadImage(formData);
        if (uploaded.ok) added.push(uploaded.url);
        else toast.error(uploaded.error);
      }
      onChange([...urls, ...added]);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {urls.length === 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors hover:border-primary hover:bg-primary-soft"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            {pending ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
          </span>
          <span className="font-semibold">{pending ? "Uploading…" : "Add photos"}</span>
          <span className="text-sm text-muted-foreground">Tap to choose from your computer or phone</span>
        </button>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {urls.map((url, index) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded URLs from any host */}
              <img src={url} alt="" className="size-full object-cover" />
              {index === 0 && (
                <span className="absolute top-1.5 left-1.5 rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">Main</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute top-1.5 right-1.5"
                aria-label="Remove photo"
                title="Remove photo"
                onClick={() => onChange(urls.filter((candidate) => candidate !== url))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
          {!full && (
            <li>
              <button
                type="button"
                disabled={pending}
                onClick={() => fileInput.current?.click()}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-ink"
              >
                {pending ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
                {pending ? "Uploading…" : "Add more"}
              </button>
            </li>
          )}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">The first photo is the one customers see in lists. Square photos on a plain white background look best.</p>
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

/**
 * Product photos. Images shared by all variants come first in the customer app; a variant shows
 * its own images before the shared ones.
 */
export function ImagesManager({ product }: { product: ProductDetail }) {
  const { images, variants } = product;
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
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

  const pick = () => fileInput.current?.click();
  const dropProps = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
      if (files.length && !full && !pending) upload(files);
    },
  };

  return (
    <div className="flex flex-col gap-4">
      {images.length === 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={pick}
          {...dropProps}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors hover:border-primary hover:bg-primary-soft",
            dragging && "border-primary bg-primary-soft",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            {pending ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
          </span>
          <span className="font-semibold">{pending ? "Uploading…" : "Add photos"}</span>
          <span className="text-sm text-muted-foreground">Tap to choose from your computer or phone, or drag them here</span>
        </button>
      ) : (
        <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", dragging && "rounded-xl ring-2 ring-primary")} {...dropProps}>
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-2 rounded-lg border p-2">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host */}
                <img src={image.url} alt={image.altText ?? ""} className="size-full object-cover" />
                {index === 0 && (
                  <span className="absolute top-1.5 left-1.5 rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">Main</span>
                )}
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
                    <SelectItem value={ALL_VARIANTS}>Every size</SelectItem>
                    {variants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        Only {variant.label || variant.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-sm" disabled={pending || index === 0} aria-label="Move earlier" title="Move earlier" onClick={() => move(index, -1)}>
                  <ArrowLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending || index === images.length - 1}
                  aria-label="Move later"
                  title="Move later"
                  onClick={() => move(index, 1)}
                >
                  <ArrowRight />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-destructive"
                  disabled={pending}
                  aria-label="Remove photo"
                  title="Remove photo"
                  onClick={() => run(async () => toastResult(await deleteProductImage({ productId: product.id, imageId: image.id })))}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
          {!full && (
            <li>
              <button
                type="button"
                disabled={pending}
                onClick={pick}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-ink"
              >
                {pending ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
                {pending ? "Uploading…" : "Add more"}
              </button>
            </li>
          )}
        </ul>
      )}

      <form
        className="flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const url = link.trim();
          if (!url) return;
          run(async () => {
            if (toastResult(await addProductImage({ productId: product.id, url, variantId: null }))) setLink("");
          });
        }}
      >
        <Input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="Or paste a link to a photo" disabled={full} className="min-w-0 flex-1" />
        <Button type="submit" variant="outline" disabled={pending || full || !link.trim()}>
          <Link2 />
          Add link
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Up to {MAX_IMAGES} photos, 10 MB each. Square photos on a plain white background look best.
        {hasVariants && " Use the box under a photo to show it for one size only."}
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
