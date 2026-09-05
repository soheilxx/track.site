"use client";

import { Sparkles } from "lucide-react";
import { useId } from "react";
import { Alert, Button, Radio } from "@track-site/ui";
import { DEMO_CURRENCIES } from "../model";
import { ViewTitle, type DemoViewProps } from "../parts";
import { aiRecommendation } from "../state";
import { fill, plural } from "../text";

/** AI Setup: one recommendation grounded in the fixture and one guided step (choose a currency, confirm). */
export function AiSetupView({ state, copy, dispatch }: DemoViewProps) {
  const id = useId();
  const rec = aiRecommendation(state);
  const { setup } = state;
  const confirmed = setup.status === "confirmed";
  const c = copy.ai;
  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-violet-soft text-violet" aria-hidden="true">
          <Sparkles className="size-4" />
        </span>
        <ViewTitle>{c.from}</ViewTitle>
      </div>
      <div className="mt-3 rounded-[var(--radius-card)] border border-violet-soft-2 bg-surface p-4">
        {confirmed ? (
          <Alert tone="ok" className="motion-safe:animate-pulse-once">
            {plural(c.result, setup.released, { version: state.configVersion })}
          </Alert>
        ) : rec.count > 0 ? (
          <>
            <p className="text-small text-ink">{plural(c.found, rec.count)}</p>
            {rec.evidence.length > 0 ? (
              <div className="mt-3">
                <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{c.evidence}</p>
                <ul className="mt-1 space-y-1 font-mono text-micro text-ink-2">
                  {rec.evidence.slice(0, 3).map((e) => (
                    <li key={e.key}>{fill(c.evidenceRow, { name: e.name, origin: copy.events.origin[e.origin], value: e.value ?? "—", time: e.time })}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <fieldset className="mt-4 min-w-0">
              <legend className="text-small font-medium text-ink">{c.question}</legend>
              <div className="mt-1 grid gap-x-3 @xl:grid-cols-3">
                {DEMO_CURRENCIES.map((currency) => (
                  <Radio key={currency} name={`${id}-currency`} value={currency} checked={setup.choice === currency} onChange={() => dispatch({ type: "choose", currency })} label={c.options[currency]} />
                ))}
              </div>
            </fieldset>
            <Button className="mt-3" disabled={setup.status !== "chosen"} onClick={() => dispatch({ type: "confirm" })}>
              {c.confirm}
            </Button>
          </>
        ) : (
          <p className="text-small text-ink">{c.foundNone}</p>
        )}
        <p className="mt-3 text-micro text-ink-3">{c.note}</p>
      </div>
    </div>
  );
}
