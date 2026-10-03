"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Opens the print dialog once the page (and its logo) has loaded, or after 2 seconds at most. */
export function PrintOnLoad() {
  useEffect(() => {
    let printed = false;
    const print = () => {
      if (printed) return;
      printed = true;
      window.print();
    };
    const timer = setTimeout(print, 2000);
    if (document.readyState === "complete") {
      setTimeout(print, 300);
    } else {
      window.addEventListener("load", print, { once: true });
    }
    return () => {
      printed = true;
      clearTimeout(timer);
      window.removeEventListener("load", print);
    };
  }, []);

  return (
    <Button onClick={() => window.print()}>
      <Printer />
      Print
    </Button>
  );
}
