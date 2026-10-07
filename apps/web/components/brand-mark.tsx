import { cn } from "@/lib/utils";

/** The logo from Appearance, or the app name's first letter on the brand colour. */
export function BrandMark({ appName, logoUrl, className }: { appName: string; logoUrl: string | null; className?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the logo can be on any host
      <img src={logoUrl} alt="" className={cn("size-9 shrink-0 rounded-xl bg-white object-contain", className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground", className)}
    >
      {appName.trim().charAt(0).toUpperCase()}
    </span>
  );
}
