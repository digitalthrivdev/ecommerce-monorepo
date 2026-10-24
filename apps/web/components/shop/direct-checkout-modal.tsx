"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { DirectCheckoutForm, type DirectCheckoutItem } from "./direct-checkout-form";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  items: DirectCheckoutItem[];
  currency: string;
  defaultCustomer?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  savedAddresses?: Array<{
    id: string;
    label?: string | null;
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string | null;
    landmark?: string | null;
    city: string;
    state: string;
    postalCode: string;
  }>;
};

export function DirectCheckoutModal({
  isOpen,
  onClose,
  items,
  currency,
  defaultCustomer,
  savedAddresses = [],
}: Props) {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border bg-white shadow-2xl">
        {/* Header matching screenshot */}
        <div className="relative flex items-center justify-center border-b px-5 py-4">
          <h2 className="text-center font-bold text-gray-900 sm:text-lg">Please fill details in english only</h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DirectCheckoutForm
            items={items}
            currency={currency}
            defaultCustomer={defaultCustomer}
            savedAddresses={savedAddresses}
            showItemHeader={true}
          />
        </div>
      </div>
    </div>
  );
}
export type { DirectCheckoutItem };
