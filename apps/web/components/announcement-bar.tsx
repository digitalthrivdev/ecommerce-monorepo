import type { PublicSettings } from "@/lib/types";

export function AnnouncementBar({ announcement }: { announcement?: PublicSettings["announcement"] }) {
  if (!announcement?.enabled || !announcement.text) return null;

  return (
    <aside
      aria-label="Announcement"
      style={{
        backgroundColor: announcement.backgroundColor ?? "var(--color-primary, #0f172a)",
        color: announcement.textColor ?? "#ffffff",
      }}
      className="relative z-50 w-full px-4 py-2 text-center text-xs font-semibold tracking-wide transition-colors"
    >
      <p className="mx-auto max-w-6xl line-clamp-1">{announcement.text}</p>
    </aside>
  );
}
