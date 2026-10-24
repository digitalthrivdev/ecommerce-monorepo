"use client";

import { useEffect, useState, useRef, type TouchEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { HomeLink } from "@/lib/types";
import { productPath } from "@/lib/paths";

export type WebBanner = {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  link: HomeLink;
};

export interface BannerCarouselProps {
  banners: WebBanner[];
  autoplay?: boolean;
}

function linkHref(link: HomeLink) {
  if (link.type === "category") return `/c/${encodeURIComponent(link.category.slug)}`;
  if (link.type === "product") return productPath(link.product.slug || link.product.id);
  return null;
}

export function BannerCarousel({ banners, autoplay = true }: BannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = banners.length;

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % count);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + count) % count);
  };

  const goTo = (index: number) => {
    setCurrentIndex(index);
  };

  useEffect(() => {
    if (!autoplay || count <= 1 || isHovered) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % count);
    }, 4500);
    return () => clearInterval(interval);
  }, [autoplay, count, isHovered]);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        next();
      } else {
        prev();
      }
    }
    touchStartX.current = null;
  };

  if (count === 0) return null;

  return (
    <div
      className="group relative w-full overflow-hidden rounded-3xl bg-muted shadow-sm ring-1 ring-black/5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides track */}
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {banners.map((banner, index) => {
          const href = linkHref(banner.link);
          const slideContent = (
            <div className="relative aspect-[2/1] sm:aspect-[2.8/1] max-h-[460px] min-h-[180px] sm:min-h-[260px] w-full shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- banner images can be on any host */}
              <img
                src={banner.imageUrl}
                alt={banner.title ?? "Banner"}
                loading={index === 0 ? "eager" : "lazy"}
                className="size-full object-cover select-none transition-transform duration-700 group-hover:scale-[1.01]"
              />
              {(banner.title || banner.subtitle) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 sm:p-10 text-white">
                  {banner.title && <p className="text-xl font-bold sm:text-3xl drop-shadow">{banner.title}</p>}
                  {banner.subtitle && (
                    <p className="mt-1 text-sm opacity-90 sm:text-base drop-shadow">{banner.subtitle}</p>
                  )}
                </div>
              )}
            </div>
          );

          return (
            <div key={banner.id} className="w-full shrink-0">
              {href ? (
                <Link href={href} className="block size-full focus:outline-none">
                  {slideContent}
                </Link>
              ) : (
                slideContent
              )}
            </div>
          );
        })}
      </div>

      {/* Prev / Next Buttons */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              prev();
            }}
            aria-label="Previous banner"
            className="absolute left-3 top-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-full bg-white/80 text-black shadow-md backdrop-blur transition hover:bg-white focus:outline-none opacity-0 group-hover:opacity-100 sm:opacity-80"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              next();
            }}
            aria-label="Next banner"
            className="absolute right-3 top-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-full bg-white/80 text-black shadow-md backdrop-blur transition hover:bg-white focus:outline-none opacity-0 group-hover:opacity-100 sm:opacity-80"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}

      {/* Dots Indicator */}
      {count > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                goTo(index);
              }}
              aria-label={`Go to slide ${index + 1}`}
              className={`transition-all rounded-full ${
                currentIndex === index
                  ? "w-6 h-2 bg-white shadow"
                  : "w-2 h-2 bg-white/60 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
