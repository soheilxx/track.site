"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { OVERAGE_POLICIES, type OveragePolicy } from "@track-site/catalog";
import { Alert, Button, Checkbox, Dialog, Field, Input, Radio, Status, type Tone } from "@track-site/ui";
import { formatCents } from "@/lib/format";
import { updateOveragePolicyAction, type UsageActionResult } from "@/server/actions/usage";
import type { PolicyState } from "@/server/usage";
import { count } from "./format";

export interface OveragePolicyFormProps {
  state: PolicyState;
  /** monthly event limit of the plan; null = no fixed cap */
  limit: number | null;
  /** the plan's overage pack; null = contractual (Enterprise) */
  pack: { events: number; priceCents: number } | null;
  canManage: boolean;
  /** integer cents */
  bounds: { minCents: number; maxCents: number };
}

const RANK: Record<OveragePolicy, number> = { pause: 0, cost_limit: 1, allow: 2 };

/** Whole euros typed by the user → integer cents; null when not a whole non-negative number. */
function parseEuros(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,7}$/.test(trimmed)) return null;
  return Number(trimmed) * 100;
}

/**
 * The customer's explicit choice between allowing overage, a monthly cost limit and pausing at the limit
 * after the grace window (owner supplement §5). Nothing is saved without the confirmation dialog; a move
 * to a less restrictive setting additionally asks for an acknowledgement that packs will be billed. The
 * consequence preview (events at which processing pauses, packs a limit pays for) repeats the small
 * arithmetic of `describePolicy` for the value being typed; the server recomputes everything on save.
 */
export function OveragePolicyForm({ state, limit, pack, canManage, bounds }: OveragePolicyFormProps) {
  const t = useTranslations("billingUsage.policy");
  const locale = useLocale();
  const router = useRouter();
  const groupId = useId();
  const [policy, setPolicy] = useState<OveragePolicy>(state.policy);
  const [euros, setEuros] = useState(state.costLimitCents != null ? String(Math.round(state.costLimitCents / 100)) : "");
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UsageActionResult | null>(null);

  const cents = policy === "cost_limit" ? parseEuros(euros) : null;
  const costLimitInvalid = policy === "cost_limit" && (cents == null || cents < bounds.minCents || cents > bounds.maxCents);
  const unchanged = policy === state.policy && (policy !== "cost_limit" || cents === state.costLimitCents);
  const lessRestrictive = RANK[policy] > RANK[state.policy] || (policy === "cost_limit" && state.policy === "cost_limit" && (cents ?? 0) > (state.costLimitCents ?? 0));
  const money = (c: number) => formatCents(c, locale);

  // consequence preview of the pending choice (display only; the server derives the stored state)
  let consequence: string;
  if (limit == null) consequence = t("consequence.noLimit");
  else if (policy === "allow") consequence = pack ? t("consequence.allow", { events: count(pack.events, locale), price: money(pack.priceCents) }) : t("consequence.noPack");
  else if (policy === "cost_limit") {
    if (!pack) consequence = t("consequence.noPack");
    else if (cents == null) consequence = t("consequence.costLimitUnset");
    else {
      const packs = Math.floor(cents / pack.priceCents);
      consequence = t("consequence.costLimit", { limit: money(cents), packs: count(packs, locale), events: count(packs * pack.events, locale), pauseAt: count(limit + packs * pack.events, locale) });
    }
  } else consequence = t("consequence.pause", { pauseAt: count(Math.ceil(limit * (1 + state.gracePercent / 100)), locale), grace: state.gracePercent });

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      let next: UsageActionResult;
      try {
        next = await updateOveragePolicyAction({ policy, costLimitCents: cents, confirmed: true });
      } catch {
        next = { ok: false, error: "generic", policy: null, costLimitCents: null, hardLimit: null };
      }
      setResult(next);
      setOpen(false);
      if (next.ok) router.refresh();
    });
  };

  const packHint = pack && cents != null && !costLimitInvalid ? t("costLimit.hint", { packs: count(Math.floor(cents / pack.priceCents), locale), events: count(pack.events, locale), price: money(pack.priceCents) }) : pack ? t("costLimit.hintPack", { events: count(pack.events, locale), price: money(pack.priceCents) }) : t("costLimit.noPack");

  return (
    <section aria-labelledby="overage-policy-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h2 id="overage-policy-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      <p className="mt-3 text-sm text-ink-2">
        <span className="font-medium text-ink">{t("current")}</span> {t(`options.${state.policy}.label`)}
        {state.policy === "cost_limit" && state.costLimitCents != null ? ` · ${money(state.costLimitCents)}` : null}
        {state.effective !== state.policy ? <span className="ml-2 text-warn">{t(`notes.${state.note ?? "cost_limit_unset"}`)}</span> : null}
      </p>
      {!canManage ? <p className="mt-2 text-sm text-ink-3">{t("readOnly")}</p> : null}
      <fieldset disabled={!canManage || pending} className="mt-4 min-w-0">
        <legend className="text-sm font-medium text-ink">{t("legend")}</legend>
        <div className="mt-1 divide-y divide-line">
          {OVERAGE_POLICIES.map((id) => (
            <Radio key={id} name={`${groupId}-policy`} value={id} checked={policy === id} onChange={() => setPolicy(id)} label={t(`options.${id}.label`)} description={t(`options.${id}.description`)} />
          ))}
        </div>
      </fieldset>
      {policy === "cost_limit" ? (
        <Field label={t("costLimit.label")} hint={packHint} error={euros !== "" && costLimitInvalid ? t("costLimit.invalid", { min: money(bounds.minCents), max: money(bounds.maxCents) }) : undefined} className="mt-4 max-w-xs">
          {(control) => <Input {...control} type="number" inputMode="numeric" min={bounds.minCents / 100} max={bounds.maxCents / 100} step={1} value={euros} onChange={(e) => setEuros(e.target.value)} disabled={!canManage || pending} />}
        </Field>
      ) : null}
      {limit == null ? <Alert tone="info" className="mt-4">{t("consequence.noLimit")}</Alert> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={!canManage || unchanged || costLimitInvalid || pending}
          onClick={() => {
            setAck(false);
            setOpen(true);
          }}
        >
          {t("save")}
        </Button>
        {unchanged && canManage ? <span className="text-xs text-ink-3">{t("unchanged")}</span> : null}
      </div>
      <ResultLine result={result} pending={pending} />
      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={t("confirm.title")}
        description={consequence}
        closeLabel={t("confirm.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              {t("confirm.cancel")}
            </Button>
            <Button loading={pending} loadingLabel={t("confirm.working")} disabled={lessRestrictive && !ack} onClick={submit}>
              {t("confirm.confirm")}
            </Button>
          </>
        }
      >
        <p>{t("confirm.text")}</p>
        {lessRestrictive ? <Checkbox className="mt-2" checked={ack} onChange={(e) => setAck(e.target.checked)} label={t("confirm.acknowledge")} /> : null}
      </Dialog>
    </section>
  );
}

function ResultLine({ result, pending }: { result: UsageActionResult | null; pending: boolean }) {
  const t = useTranslations("billingUsage.policy");
  if (pending) {
    return (
      <Status tone="info" live indicator="icon" className="mt-3 text-xs">
        {t("confirm.working")}
      </Status>
    );
  }
  if (!result) return <span role="status" aria-live="polite" className="sr-only" />;
  let tone: Tone;
  let text: string;
  if (!result.ok || result.error) {
    tone = "bad";
    text = t(`errors.${result.error ?? "generic"}`);
  } else if (result.hardLimit === true) {
    tone = "warn";
    text = t("savedPaused");
  } else if (result.hardLimit === false) {
    tone = "ok";
    text = t("savedNotPaused");
  } else {
    tone = "ok";
    text = t("saved");
  }
  return (
    <Status tone={tone} live indicator="icon" className="mt-3 text-xs">
      {text}
    </Status>
  );
}
