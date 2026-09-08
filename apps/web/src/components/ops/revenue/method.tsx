import { getTranslations } from "next-intl/server";

const NOTES = ["mrr", "atRisk", "trials", "overage", "invoices"] as const;

/** How every figure on the page is derived — printed with the numbers so nobody mistakes list-price MRR for booked revenue. */
export async function MethodNotes() {
  const t = await getTranslations("opsRevenue.method");
  return (
    <section aria-labelledby="ops-revenue-method-title" className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-5">
      <h2 id="ops-revenue-method-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
        {NOTES.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </section>
  );
}
