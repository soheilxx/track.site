import { getTranslations } from "next-intl/server";
import { Status, type Tone } from "@track-site/ui";
import type { VendorsView } from "@/server/ops/health";
import { fmtCount, fmtDateTime } from "./format";
import { Facts, HealthSection, Panel, Unknown, type Fact } from "./section";
import { mailDomainLabel } from "./summary";

const AI_TONE: Record<VendorsView["ai"]["ai"], Tone> = { ok: "ok", not_configured: "neutral", invalid_key: "bad", unreachable: "warn", models_missing: "warn" };
const BILLING_TONE: Record<VendorsView["billing"]["billing"], Tone> = { ok: "ok", not_configured: "neutral", prices_failing: "bad", prices_missing: "warn", no_prices: "warn" };

function mailTone(mail: VendorsView["mail"]): Tone {
  if (mail.mail !== "resend" || !mail.mailDomain) return "neutral";
  if (mail.mailDomain.status === "verified") return "ok";
  if (mail.mailDomain.status === "sending_only_key") return "neutral";
  return "warn";
}

/** AI provider, mail transport / sender domain, Stripe price slots and the database probe — the checks behind /api/health. */
export async function Vendors({ vendors, locale }: { vendors: VendorsView; locale: string }) {
  const t = await getTranslations("opsHealth");
  const unknown = <Unknown label={t("states.unknown")} />;
  const list = (items: string[]) => (items.length ? <span className="font-mono text-xs break-words">{items.join(", ")}</span> : <span className="text-ink-3">{t("vendors.none")}</span>);
  const ai = vendors.ai;
  const mail = vendors.mail;
  const billing = vendors.billing;
  const cards: Array<{ key: string; label: string; tone: Tone; state: string; facts: Fact[] }> = [
    {
      key: "ai",
      label: t("vendors.ai.label"),
      tone: AI_TONE[ai.ai],
      state: t(`vendors.ai.states.${ai.ai}`),
      facts: [
        { label: t("vendors.ai.available"), value: ai.aiModels ? list(ai.aiModels.available) : unknown },
        { label: t("vendors.ai.missing"), value: ai.aiModels ? list(ai.aiModels.missing) : unknown },
        { label: t("vendors.checkedAt"), value: fmtDateTime(ai.aiCheckedAt, locale) ?? unknown },
      ],
    },
    {
      key: "mail",
      label: t("vendors.mail.label"),
      tone: mailTone(mail),
      state: t(`vendors.mail.transport.${mail.mail}`),
      facts: [
        { label: t("vendors.mail.domain"), value: mail.mailDomain?.domain ? <span className="font-mono text-xs">{mail.mailDomain.domain}</span> : unknown },
        { label: t("vendors.mail.domainState"), value: mail.mailDomain ? mailDomainLabel(t, mail.mailDomain.status) : unknown },
      ],
    },
    {
      key: "billing",
      label: t("vendors.billing.label"),
      tone: BILLING_TONE[billing.billing],
      state: t(`vendors.billing.states.${billing.billing}`),
      facts: [
        { label: t("vendors.billing.ok"), value: billing.billingPrices ? list(billing.billingPrices.ok) : unknown },
        { label: t("vendors.billing.missing"), value: billing.billingPrices ? list(billing.billingPrices.missing) : unknown },
        { label: t("vendors.billing.failed"), value: billing.billingPrices ? list(billing.billingPrices.failed.map((f) => `${f.env}: ${f.error}`)) : unknown },
        { label: t("vendors.billing.deprecated"), value: billing.billingPrices ? list(billing.billingPrices.deprecated) : unknown },
      ],
    },
    {
      key: "probe",
      label: t("vendors.database.label"),
      tone: vendors.dbProbe ? "ok" : "bad",
      state: vendors.dbProbe ? t("vendors.database.ok") : t("vendors.database.down"),
      facts: [{ label: t("vendors.database.migrations"), value: vendors.migrations !== null ? fmtCount(vendors.migrations, locale) : unknown }],
    },
  ];
  return (
    <HealthSection id="vendors" title={t("vendors.title")} intro={t("vendors.intro")}>
      <ul className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <li key={card.key} data-testid={`ops-health-vendor-${card.key}`}>
            <Panel className="h-full">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{card.label}</h3>
                <Status tone={card.tone} indicator="both">
                  {card.state}
                </Status>
              </div>
              <div className="mt-3">
                <Facts items={card.facts} columns={2} />
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </HealthSection>
  );
}
