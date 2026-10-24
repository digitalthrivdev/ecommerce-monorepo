"use client";

import { useState } from "react";

import type { CatalogImage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  images: CatalogImage[];
  productName: string;
};

export function ProductGallery({ images, productName }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images.length) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-3xl border bg-muted text-4xl font-extrabold text-primary">
        {productName.charAt(0)}
      </div>
    );
  }

  const activeImage = images[activeIndex] ?? images[0]!;

  return (
    <div className="flex flex-col gap-3">
      {/* Main Image */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xs">
        {/* eslint-disable-next-line @next/next/no-img-element -- client-specific image */}
        <img
          src={activeImage.url}
          alt={activeImage.altText ?? productName}
          className="size-full object-contain p-6 transition-all duration-200"
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {images.map((img, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "relative flex size-18 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border bg-white p-1 transition-all",
                  isActive
                    ? "border-2 border-primary ring-2 ring-primary/20 shadow-xs"
                    : "border-gray-200 opacity-70 hover:border-gray-300 hover:opacity-100",
                )}
                aria-label={`View image ${index + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- client-specific image */}
                <img
                  src={img.url}
                  alt={img.altText ?? `${productName} thumbnail ${index + 1}`}
                  className="size-full object-contain"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
