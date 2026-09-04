"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useTransition, type FormEvent } from "react";
import { consentSourceSchema } from "@track-site/events";
import { regionGroupOf, type ConnectorType } from "@track-site/policy";
import { Button, Checkbox, Field, Select, buttonVariants } from "@track-site/ui";
import { intlLocale } from "@/lib/format";
import { GRANTABLE_PURPOSES, REGION_GROUP_ORDER, REGION_UNKNOWN, SIMULATOR_CATEGORIES, SIMULATOR_COUNTRIES, SIMULATOR_SOURCES, serializeSimulatorInput, type SimulatorInput } from "@/server/consent-simulator";
import { connectorLabel, regionGroupLabel, signalLabel } from "./labels";

export interface SimulatorPolicyOption {
  value: SimulatorInput["policy"];
  version: number | null;
}

export interface SimulatorDestinationOption {
  id: string;
  name: string;
  connectorType: ConnectorType;
  status: string;
}

interface SimulatorFormProps {
  input: SimulatorInput;
  defaults: SimulatorInput;
  policies: SimulatorPolicyOption[];
  destinations: SimulatorDestinationOption[];
  hypothetical: ConnectorType[];
  hasCustomEvents: boolean;
  locale: string;
}

const PARAM_KEYS = ["policy", "region", "signal", "source", "destination", "category"] as const;

/** Countries per region group, named and sorted in the viewer's language (falls back to the ISO code). */
function buildCountryGroups(locale: string) {
  let countryName = (code: string) => code;
  try {
    const names = new Intl.DisplayNames([intlLocale(locale)], { type: "region" });
    countryName = (code: string) => names.of(code) ?? code;
  } catch {
    // Intl.DisplayNames unavailable: ISO codes are shown
  }
  return REGION_GROUP_ORDER.filter((g) => g !== "UNKNOWN").map((group) => ({
    group,
    countries: SIMULATOR_COUNTRIES.filter((c) => regionGroupOf(c) === group)
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, intlLocale(locale))),
  }));
}

/**
 * Scenario form. It is a plain GET form (works without JavaScript and keeps the scenario in the URL);
 * with JavaScript every change navigates to the new URL immediately, so the server re-evaluates and
 * the link stays shareable. Uncontrolled inputs: the page remounts the form when the URL changes.
 */
export function SimulatorForm({ input, defaults, policies, destinations, hypothetical, hasCustomEvents, locale }: SimulatorFormProps) {
  const t = useTranslations("consent.simulator.form");
  const tc = useTranslations("consent");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const countryGroups = useMemo(() => buildCountryGroups(locale), [locale]);

  const apply = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const key of PARAM_KEYS) params.set(key, String(data.get(key) ?? ""));
    params.set(
      "granted",
      data
        .getAll("granted")
        .map(String)
        .filter((v) => v !== "")
        .join(","),
    );
    params.set("gpc", data.get("gpc") ? "1" : "0");
    startTransition(() => router.replace(`/app/consent/simulator?${params.toString()}`, { scroll: false }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(event.currentTarget);
  };

  return (
    <form ref={formRef} method="get" action="/app/consent/simulator" onSubmit={onSubmit} onChange={(e) => apply(e.currentTarget)} className="space-y-4" aria-busy={isPending || undefined}>
      <Field label={t("policy")}>
        {(control) => (
          <Select {...control} name="policy" defaultValue={input.policy}>
            {policies.map((p) => (
              <option key={p.value} value={p.value} disabled={p.value === "draft" && p.version === null}>
                {p.value === "published" ? (p.version === null ? t("policyDefault") : t("policyPublished", { version: p.version })) : p.version === null ? `${tc("policy.draft")} — ${t("policyUnavailable")}` : t("policyDraft", { version: p.version })}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("region")}>
        {(control) => (
          <Select {...control} name="region" defaultValue={input.region}>
            {countryGroups.map((g) => (
              <optgroup key={g.group} label={regionGroupLabel(tc, g.group)}>
                {g.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label={regionGroupLabel(tc, "UNKNOWN")}>
              <option value={REGION_UNKNOWN}>{t("regionUnknown")}</option>
            </optgroup>
          </Select>
        )}
      </Field>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">{t("purposes")}</legend>
        <input type="hidden" name="granted" value="" />
        <Checkbox checked disabled readOnly label={tc("purposes.necessary")} description={t("necessaryAlways")} className="py-1" />
        {GRANTABLE_PURPOSES.map((purpose) => (
          <Checkbox key={purpose} name="granted" value={purpose} defaultChecked={input.granted.includes(purpose)} label={tc(`purposes.${purpose}`)} className="py-1" />
        ))}
      </fieldset>

      <Field label={t("signal")}>
        {(control) => (
          <Select {...control} name="signal" defaultValue={input.signal}>
            {consentSourceSchema.options.map((source) => (
              <option key={source} value={source}>
                {signalLabel(tc, source)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div>
        <input type="hidden" name="gpc" value="0" />
        <Checkbox name="gpc" value="1" defaultChecked={input.gpc} label={t("gpc")} className="py-1" />
      </div>

      <Field label={t("source")}>
        {(control) => (
          <Select {...control} name="source" defaultValue={input.source}>
            {SIMULATOR_SOURCES.map((source) => (
              <option key={source} value={source}>
                {t(`sources.${source}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("destination")}>
        {(control) => (
          <Select {...control} name="destination" defaultValue={input.destination}>
            <option value="all">{t("allDestinations")}</option>
            {destinations.length ? (
              <optgroup label={t("connected")}>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {connectorLabel(tc, d.connectorType)} ({tc(`destinationStatus.${d.status}`)})
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label={t("hypothetical")}>
              {hypothetical.map((type) => (
                <option key={type} value={`type:${type}`}>
                  {connectorLabel(tc, type)}
                </option>
              ))}
            </optgroup>
          </Select>
        )}
      </Field>

      <Field label={t("category")}>
        {(control) => (
          <Select {...control} name="category" defaultValue={input.category}>
            {SIMULATOR_CATEGORIES.filter((c) => c !== "custom" || hasCustomEvents).map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={isPending} loadingLabel={t("updating")}>
          {t("apply")}
        </Button>
        <Link href={`/app/consent/simulator?${serializeSimulatorInput(defaults)}`} className={buttonVariants({ variant: "ghost" })}>
          {t("reset")}
        </Link>
      </div>
      <p role="status" aria-live="polite" className="min-h-4 text-xs text-ink-3">
        {isPending ? t("updating") : ""}
      </p>
    </form>
  );
}
