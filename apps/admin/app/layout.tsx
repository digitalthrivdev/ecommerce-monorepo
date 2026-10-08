import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";

import { BrandStyle } from "@/components/brand-style";
import { BrowserErrorReporter } from "@/components/browser-error-reporter";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  description: "Grocery platform admin dashboard",
};

/** Read per request, so setting SENTRY_DSN on the server turns browser reports on without a rebuild. */
async function ErrorReporting() {
  await connection();
  const dsn = process.env.SENTRY_DSN;
  return dsn ? <BrowserErrorReporter dsn={dsn} /> : null;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the theme class on <html> before hydration.
    <html lang="en" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <BrandStyle />
        <ErrorReporting />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors closeButton position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
