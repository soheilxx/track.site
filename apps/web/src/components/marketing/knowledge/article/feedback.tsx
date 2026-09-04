"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@track-site/ui";

export interface FeedbackLabels {
  heading: string;
  yes: string;
  no: string;
  sending: string;
  thanks: string;
  error: string;
}

type State = { kind: "idle" } | { kind: "sending"; helpful: boolean } | { kind: "done" } | { kind: "error" };

/**
 * "Was this article helpful?" — two buttons that post one anonymous vote to
 * `/api/knowledge/feedback` ({ translationGroupId, locale, helpful }). After a vote only a thank-you is
 * shown: no counts, no percentages, no invented success rate (supplement §6). Failures are said
 * honestly and the buttons stay usable. Focus moves to the confirmation so keyboard and screen-reader
 * users do not lose their place when the buttons disappear. Nothing is stored in the browser.
 */
export function ArticleFeedback({ translationGroupId, locale, labels }: { translationGroupId: string; locale: string; labels: FeedbackLabels }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const headingId = useId();
  const thanksRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.kind === "done") thanksRef.current?.focus();
  }, [state.kind]);

  const vote = async (helpful: boolean) => {
    if (state.kind === "sending") return;
    setState({ kind: "sending", helpful });
    try {
      const res = await fetch("/api/knowledge/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ translationGroupId, locale, helpful }) });
      setState(res.ok ? { kind: "done" } : { kind: "error" });
    } catch {
      setState({ kind: "error" });
    }
  };

  return (
    <section aria-labelledby={headingId} data-article-feedback="" data-print="hide" className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
      <h2 id={headingId} className="text-base font-semibold text-ink">
        {labels.heading}
      </h2>
      {state.kind === "done" ? (
        <p ref={thanksRef} tabIndex={-1} role="status" className="mt-2 text-small text-ink-2 outline-none">
          {labels.thanks}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="md" onClick={() => vote(true)} loading={state.kind === "sending" && state.helpful} loadingLabel={labels.sending} disabled={state.kind === "sending" && !state.helpful} leadingIcon={<ThumbsUp className="size-4" aria-hidden="true" />}>
              {labels.yes}
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => vote(false)} loading={state.kind === "sending" && !state.helpful} loadingLabel={labels.sending} disabled={state.kind === "sending" && state.helpful} leadingIcon={<ThumbsDown className="size-4" aria-hidden="true" />}>
              {labels.no}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-small text-ink-3">
            {state.kind === "error" ? labels.error : ""}
          </p>
        </>
      )}
    </section>
  );
}
