import Link from "next/link";

/** Root-level 404 for non-localized paths (app/api/cdn). Returns a real 404 status. */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink antialiased">
        <main className="mx-auto max-w-lg px-6 py-24 text-center">
          <p className="font-display text-6xl font-bold text-primary">404</p>
          <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
          <p className="mt-2 text-ink-2">The page you are looking for does not exist.</p>
          <Link href="/" className="mt-6 inline-block text-primary underline">
            Back to track.site
          </Link>
        </main>
      </body>
    </html>
  );
}
