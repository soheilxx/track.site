import { getTranslations } from "next-intl/server";
import { redactDeep } from "@track-site/core";
import { Badge } from "@track-site/ui";
import type { ChangeArea, ReadableChange } from "@/server/releases";
import { changeSubject, changeValue, OP_TONE } from "./labels";

const AREA_ORDER: readonly ChangeArea[] = ["events", "destinations", "consent", "settings", "site", "other"];

/**
 * Readable configuration diff: entries grouped by area (events, destinations, consent, settings),
 * each with its operation, the subject (event name / destination name), the field below it and the
 * before → after values. Values pass through the platform redaction before they are rendered.
 */
export async function DiffList({ changes, destinationNames, compact = false }: { changes: ReadableChange[]; destinationNames: Record<string, string>; compact?: boolean }) {
  const t = await getTranslations("releases");
  if (changes.length === 0) return <p className="text-sm text-ink-3">{t("draft.noChanges")}</p>;
  const groups = AREA_ORDER.map((area) => ({ area, entries: changes.filter((c) => c.area === area) })).filter((g) => g.entries.length > 0);
  return (
    <div className="space-y-5" data-testid="release-diff">
      {groups.map((g) => (
        <section key={g.area} aria-label={t(`changes.area.${g.area}`)}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t(`changes.area.${g.area}`)}</h3>
          <ul className="mt-2 divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {g.entries.map((c) => {
              const { subject, field } = changeSubject(t, c, destinationNames);
              const before = changeValue(t, redactDeep(c.before));
              const after = changeValue(t, redactDeep(c.after));
              return (
                <li key={c.path} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-start sm:gap-3">
                  <Badge tone={OP_TONE[c.op]} className="shrink-0 self-start">
                    {t(`changes.op.${c.op}`)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">
                      {subject ? <span className="font-medium">{subject}</span> : null}
                      {subject && field ? <span className="text-ink-3"> · </span> : null}
                      {field ? <span className="font-mono text-xs text-ink-2">{field}</span> : null}
                    </p>
                    {!compact && c.op === "change" ? (
                      <p className="mt-0.5 break-all font-mono text-xs text-ink-2">
                        <span className="text-ink-3">{t("changes.before")}: </span>
                        <span className="line-through decoration-bad/60">{before}</span>
                        <span className="text-ink-3"> → {t("changes.after")}: </span>
                        <span>{after}</span>
                      </p>
                    ) : null}
                    {!compact && c.op !== "change" && (c.op === "add" ? c.after : c.before) !== undefined && typeof (c.op === "add" ? c.after : c.before) !== "object" ? (
                      <p className="mt-0.5 break-all font-mono text-xs text-ink-2">{c.op === "add" ? after : before}</p>
                    ) : null}
                    {compact ? <p className="mt-0.5 text-xs text-ink-3">{c.summary}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
