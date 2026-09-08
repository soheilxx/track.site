import { getTranslations } from "next-intl/server";

const ITEMS = ["sources", "milestones", "proxies", "retention", "noGeo", "privacy"] as const;

/** How every number on the page is measured, what is a proxy, and what is deliberately not shown. */
export async function MethodNotes() {
  const t = await getTranslations("opsGrowth.method");
  return (
    <section aria-labelledby="ops-growth-method-title" className="space-y-3" data-testid="ops-growth-method">
      <h2 id="ops-growth-method-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
        {ITEMS.map((item) => (
          <li key={item}>{t(`items.${item}`)}</li>
        ))}
      </ul>
    </section>
  );
}
