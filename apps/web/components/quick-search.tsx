"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Package, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { searchSuggestions, type SearchSuggestion } from "@/lib/actions";
import { productPath } from "@/lib/paths";
import { cn, formatMoney } from "@/lib/utils";

type Props = {
  currency?: string;
  initialQuery?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
};

export function QuickSearch({
  currency = "INR",
  initialQuery = "",
  placeholder = "Search for products, brands and more...",
  className,
  inputClassName,
  autoFocus = false,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Debounce the query input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch suggestions when debouncedQuery changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setHighlightedIndex(-1);
      return;
    }

    let active = true;
    setLoading(true);

    searchSuggestions(debouncedQuery)
      .then((data) => {
        if (active) {
          setResults(data);
          setLoading(false);
          setHighlightedIndex(-1);
        }
      })
      .catch(() => {
        if (active) {
          setResults([]);
          setLoading(false);
          setHighlightedIndex(-1);
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        e.preventDefault();
        const target = results[highlightedIndex];
        setIsOpen(false);
        router.push(productPath(target.slug || target.productId));
      }
    }
  }

  function handleClear() {
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  const showDropdown =
    isOpen &&
    query.trim().length >= 2 &&
    (loading || results.length > 0 || debouncedQuery.length >= 2);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <form
        action="/search"
        method="GET"
        onSubmit={() => setIsOpen(false)}
        className="relative flex items-center"
      >
        <Search className="absolute left-3.5 size-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          name="q"
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "h-10 w-full rounded-full border border-gray-200 bg-gray-50/80 pl-10 pr-10 text-sm outline-hidden transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20",
            inputClassName,
          )}
        />

        <div className="absolute right-3 flex items-center gap-1">
          {loading && (
            <Loader2 className="size-4 animate-spin text-gray-400" />
          )}
          {!loading && query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </form>

      {/* Instant Suggestions Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-6 text-xs text-gray-400">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Searching products...</span>
            </div>
          ) : results.length > 0 ? (
            <div>
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <span>Products</span>
                <span>{results.length} results</span>
              </div>

              <div role="listbox" className="max-h-[380px] overflow-y-auto divide-y divide-gray-50">
                {results.map((item, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <Link
                      key={item.productId}
                      href={productPath(item.slug || item.productId)}
                      onClick={() => setIsOpen(false)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={cn(
                        "flex items-center gap-3.5 px-4 py-2.5 transition text-left group",
                        isHighlighted ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                    >
                      {/* Product Thumbnail */}
                      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="size-full object-contain p-1 transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <Package className="size-5 text-gray-300" />
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {item.brandName ? `${item.brandName} • ` : ""}
                          {item.categoryName}
                        </p>
                      </div>

                      {/* Price & Stock */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-gray-950">
                          {formatMoney(item.price, currency)}
                        </p>
                        {item.compareAtPrice && (
                          <p className="text-[11px] text-gray-400 line-through">
                            {formatMoney(item.compareAtPrice, currency)}
                          </p>
                        )}
                        {!item.inStock && (
                          <span className="inline-block rounded-xs bg-red-50 px-1 text-[10px] font-semibold text-red-600">
                            Out of stock
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* View all footer */}
              <Link
                href={`/search?q=${encodeURIComponent(query.trim())}`}
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-2.5 text-xs font-bold text-primary hover:bg-gray-100/70 transition"
              >
                <span>View all results for &ldquo;{query.trim()}&rdquo;</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-gray-800">
                No products found for &ldquo;{debouncedQuery}&rdquo;
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Check the spelling or try searching for another keyword.
              </p>
              <Link
                href="/search"
                onClick={() => setIsOpen(false)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <span>Browse all products</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
