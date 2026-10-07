import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-5 py-24 text-center">
      <p className="text-sm font-semibold tracking-wider text-primary-ink uppercase">404</p>
      <h1 className="text-3xl font-extrabold">This page doesn&apos;t exist</h1>
      <p className="text-muted-foreground">The link may be old or mistyped.</p>
      <Link href="/" className="mt-2 inline-flex h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:opacity-90">
        Go to the home page
      </Link>
    </div>
  );
}
