"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink antialiased">
        <main className="mx-auto max-w-lg px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-ink-2">The error has been recorded{error.digest ? ` (${error.digest})` : ""}. Please try again.</p>
          <button type="button" className="mt-6 rounded-xl bg-primary px-4 py-2 text-white" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
