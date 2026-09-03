import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, Sparkles, Waypoints } from "lucide-react";
import { Card, Container, buttonVariants, cn } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { DomainStartForm } from "@/components/marketing/domain-start-form";
import { IntegrationLogoGrid } from "@/components/marketing/integration-grid";
import { Link } from "@/i18n/navigation";
import { organizationJsonLd, pageMetadata, websiteJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  // the home page carries the brand itself: no " · Track" template suffix, one complete sentence within snippet length
  return pageMetadata({ locale, path: "/", title: { absolute: seoTitle(t("defaultTitle"), 70) }, description: seoDescription(t("defaultDescription")) });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const steps = t.raw("steps.items") as Array<{ title: string; text: string }>;
  const features = t.raw("features.items") as Array<{ title: string; text: string }>;
  const security = t.raw("security.items") as string[];
  const icons = [Waypoints, ShieldCheck, Sparkles, CheckCircle2, Lock, ArrowRight];
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(locale)]} />
      <section className="relative overflow-hidden">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden="true" />
        <Container className="relative grid gap-10 py-16 md:grid-cols-[1.1fr_1fr] md:items-center md:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl lg:text-6xl">{t("title")}</h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">{t("subtitle")}</p>
            <div className="mt-8">
              <DomainStartForm />
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-3">
              {(["eu", "consent", "signed", "noCode"] as const).map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" />
                  {t(`trust.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <DashboardPreview />
        </Container>
      </section>

      <section className="border-t border-line bg-surface">
        <Container className="py-16 md:py-20">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">{t("problemTitle")}</h2>
            <p className="mt-4 text-lg text-ink-2">{t("problemText")}</p>
          </div>
        </Container>
      </section>

      <section id="how-it-works">
        <Container className="py-16 md:py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">{t("steps.title")}</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full p-5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft font-display text-sm font-bold text-primary">{i + 1}</span>
                  <h3 className="mt-3 text-base font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-2">{s.text}</p>
                </Card>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <Link href="/how-it-works" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t("ctaSecondary")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Container>
      </section>

      <section className="border-t border-line bg-surface">
        <Container className="py-16 md:py-20">
          <h2 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-ink">{t("features.title")}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = icons[i % icons.length]!;
              return (
                <Card key={f.title} className="p-5">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-semibold text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm text-ink-2">{f.text}</p>
                </Card>
              );
            })}
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-16 md:py-20">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">{t("integrations.title")}</h2>
              <p className="mt-3 text-ink-2">{t("integrations.text")}</p>
            </div>
            <Link href="/integrations" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t("integrations.all")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8">
            <IntegrationLogoGrid />
          </div>
        </Container>
      </section>

      <section className="border-t border-line bg-surface">
        <Container className="grid gap-8 py-16 md:grid-cols-2 md:py-20">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">{t("security.title")}</h2>
            <ul className="mt-6 space-y-3">
              {security.map((s) => (
                <li key={s} className="flex items-start gap-3 text-ink-2">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-4 text-sm font-medium">
              <Link href="/security" className="text-primary hover:underline">
                Security
              </Link>
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy
              </Link>
              <Link href="/data-processing" className="text-primary hover:underline">
                DPA
              </Link>
            </div>
          </div>
          <Card className="p-6">
            <h3 className="font-display text-2xl font-semibold text-ink">{t("finalCta.title")}</h3>
            <p className="mt-2 text-ink-2">{t("finalCta.text")}</p>
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
              {t("finalCta.cta")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Card>
        </Container>
      </section>
    </>
  );
}

/** Realistic, data-driven preview of the dashboard (rendered, not a screenshot). */
function DashboardPreview() {
  const rows = [
    { name: "purchase", source: "server · shopify", state: "delivered", dests: 4 },
    { name: "add_to_cart", source: "browser", state: "delivered", dests: 3 },
    { name: "page_view", source: "browser", state: "routed", dests: 2 },
    { name: "generate_lead", source: "browser", state: "policy", dests: 0 },
  ];
  return (
    <div aria-hidden="true" className="card relative mx-auto w-full max-w-md overflow-hidden p-4 md:max-w-none">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Tracking health</p>
          <p className="font-display text-3xl font-semibold text-ink">
            92<span className="text-base text-ink-3">/100</span>
          </p>
        </div>
        <div className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">Config v14 live</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Accepted", "184,203"],
          ["Delivered", "99.6%"],
          ["Dedup", "1.2%"],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">{l}</p>
            <p className="text-lg font-semibold text-ink">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[1.2fr_1fr_0.9fr_0.5fr] bg-surface-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
          <span>Event</span>
          <span>Source</span>
          <span>State</span>
          <span className="text-right">Dest.</span>
        </div>
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[1.2fr_1fr_0.9fr_0.5fr] items-center border-t border-line px-3 py-2 text-sm">
            <span className="font-mono text-xs text-ink">{r.name}</span>
            <span className="text-xs text-ink-3">{r.source}</span>
            <span>
              <span className={`inline-block h-2 w-2 rounded-full ${r.state === "delivered" ? "bg-ok" : r.state === "routed" ? "bg-info" : "bg-warn"}`} /> <span className="text-xs text-ink-2">{r.state}</span>
            </span>
            <span className="text-right text-xs text-ink-2">{r.dests}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
