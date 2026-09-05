import type { Metadata } from "next";
import Link from "next/link";
import { ThemeScript } from "@/components/theme-script";
import { DEFAULT_LOCALE } from "@/i18n/routing";
import { bodyClassName, fontClassName } from "./fonts";
import "./marketing.css";

export const metadata: Metadata = {
  title: "Page not found · Track",
  robots: { index: false, follow: false },
};

/**
 * Global 404 (`experimental.globalNotFound`): the app has no shared root layout, so this file is a
 * complete document. It serves unmatched non-localized paths (/app, /api, /cdn, file-like paths)
 * and an unknown locale segment; localized marketing 404s are handled by
 * `[locale]/(marketing)/not-found.tsx` inside the marketing layout. Returns a real 404 status.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" suppressHydrationWarning className={fontClassName}>
      <head>
        <ThemeScript />
      </head>
      <body className={bodyClassName}>
        <main className="mx-auto max-w-lg px-6 py-24 text-center">
          <p className="font-display text-6xl font-bold text-primary">404</p>
          <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
          <p className="mt-2 text-ink-2">The page you are looking for does not exist.</p>
          <Link href={`/${DEFAULT_LOCALE}`} className="mt-6 inline-block text-primary underline">
            Back to Track
          </Link>
        </main>
      </body>
    </html>
  );
}
