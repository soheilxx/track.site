"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Card, CardContent, Dialog, EmptyState, Status, TBody, THead, Table, Td, Th, Tr, type Tone } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { revokeAnnouncementAction, type ControlsActionState } from "@/server/ops/actions/controls";
import type { AnnouncementListItem, AnnouncementStatus } from "@/server/ops/controls";
import { ActionFeedback } from "./feedback";
import { formatDateTime } from "./format";
import { errorLabel, planLabel } from "./labels";

const STATUS_TONE: Record<AnnouncementStatus, Tone> = { scheduled: "info", active: "ok", ended: "neutral", revoked: "warn" };
const SEVERITY_TONE: Record<AnnouncementListItem["severity"], Tone> = { info: "info", warn: "warn", bad: "bad" };

export interface AnnouncementsTableProps {
  items: AnnouncementListItem[];
  /** organization id → name for audiences that name organizations */
  organisations: Record<string, { name: string; slug: string }>;
  locale: string;
}

/** Announcements with status, audience, window (UTC) and a confirmed revoke; the newest window first. */
export function AnnouncementsTable({ items, organisations, locale }: AnnouncementsTableProps) {
  const t = useTranslations("opsControls.announcements");
  const tc = useTranslations("opsControls");
  const router = useRouter();
  const [target, setTarget] = useState<AnnouncementListItem | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ControlsActionState | null>(null);

  const revoke = () => {
    if (!target) return;
    startTransition(async () => {
      let r: ControlsActionState;
      try {
        r = await revokeAnnouncementAction({ id: target.id, confirmed: true });
      } catch {
        r = { ok: false, error: "generic" };
      }
      setResult(r);
      if (r.ok) {
        setTarget(null);
        router.refresh();
      }
    });
  };

  const audienceText = (a: AnnouncementListItem["audience"]): string => {
    const parts: string[] = [];
    if (a.plans?.length) parts.push(t("audience.plans", { plans: a.plans.map((p) => planLabel(tc, p)).join(", ") }));
    if (a.organizationIds?.length) {
      const names = a.organizationIds.map((id) => organisations[id]?.slug ?? id.slice(0, 8));
      parts.push(`${t("audience.organisations", { count: formatNumber(a.organizationIds.length, locale) })}: ${names.join(", ")}`);
    }
    return parts.length ? parts.join(" · ") : t("audience.everyone");
  };

  if (items.length === 0) return <EmptyState title={t("empty")} description={t("emptyText")} />;
  return (
    <div className="space-y-3">
      <ActionFeedback state={result && result.ok ? result : null} />
      <Card variant="flat">
        <CardContent className="px-2 py-2 sm:px-3">
          <Table caption={t("table.caption")}>
            <THead>
              <Tr>
                <Th>{t("table.title")}</Th>
                <Th>{t("table.status")}</Th>
                <Th>{t("table.window")}</Th>
                <Th>{t("table.audience")}</Th>
                <Th>{t("table.actions")}</Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <Tr key={item.id} data-testid="ops-announcement-row" data-status={item.status}>
                  <Td label={t("table.title")}>
                    <p className="font-medium text-ink">{item.title || "—"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
                      <Status tone={SEVERITY_TONE[item.severity]} className="text-xs">
                        {t(`severity.${item.severity}`)}
                      </Status>
                      <span className="font-mono">{item.locales.join(", ")}</span>
                      {item.linkUrl ? (
                        <a href={item.linkUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-6 items-center gap-1 text-primary underline-offset-2 hover:underline">
                          <ExternalLink className="size-3" aria-hidden="true" />
                          {t("link")}
                        </a>
                      ) : null}
                    </p>
                  </Td>
                  <Td label={t("table.status")}>
                    <Status tone={STATUS_TONE[item.status]} indicator="both">
                      {t(`status.${item.status}`)}
                    </Status>
                  </Td>
                  <Td label={t("table.window")}>
                    <p className="text-sm text-ink-2">{t("window.from", { start: formatDateTime(item.startsAt, locale, "UTC") ?? "" })}</p>
                    <p className="text-xs text-ink-3">{item.endsAt ? t("window.until", { end: formatDateTime(item.endsAt, locale, "UTC") ?? "" }) : t("window.open")}</p>
                    {item.revokedAt ? <p className="text-xs text-ink-3">{t("window.revoked", { when: formatDateTime(item.revokedAt, locale) ?? "" })}</p> : null}
                  </Td>
                  <Td label={t("table.audience")} className="max-w-xs break-words text-sm text-ink-2">
                    {audienceText(item.audience)}
                  </Td>
                  <Td label={t("table.actions")}>
                    {item.status === "active" || item.status === "scheduled" ? (
                      <Button size="sm" variant="danger" disabled={pending} onClick={() => setTarget(item)} aria-haspopup="dialog" data-testid="ops-announcement-revoke">
                        {t("revoke")}
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={target !== null}
        onClose={() => (pending ? undefined : setTarget(null))}
        title={target ? t("dialog.revokeTitle", { title: target.title || target.id.slice(0, 8) }) : ""}
        description={t("dialog.revokeText")}
        closeLabel={tc("common.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setTarget(null)}>
              {tc("common.cancel")}
            </Button>
            <Button variant="danger" loading={pending} loadingLabel={tc("common.working")} onClick={revoke} data-testid="ops-announcement-revoke-confirm">
              {t("dialog.revokeConfirm")}
            </Button>
          </>
        }
      >
        {result && !result.ok ? (
          <div className="py-2">
            <Alert tone="bad">{errorLabel(tc, result.error)}</Alert>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
