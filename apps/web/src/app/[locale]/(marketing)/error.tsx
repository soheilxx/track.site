"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";
import { Button, Container } from "@track-site/ui";
import { DEFAULT_LOCALE, isKnownLocale } from "@/i18n/routing";
import { ERROR_PAGE_COPY } from "../error-copy";

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  // the strings come from a plain table (see error-copy.ts): no message-format runtime on the public pages
  const t = ERROR_PAGE_COPY[isKnownLocale(locale) ? locale : DEFAULT_LOCALE];
  useEffect(() => {
    // digest only: never log messages that could contain user data
    console.error("page error", error.digest ?? "no-digest");
  }, [error]);
  return (
    <Container className="py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">{t.title}</h1>
      <p className="mt-2 text-ink-2">{t.text}</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-ink-3">{error.digest}</p> : null}
      <Button className="mt-6" onClick={() => reset()}>
        {t.retry}
      </Button>
    </Container>
  );
}
