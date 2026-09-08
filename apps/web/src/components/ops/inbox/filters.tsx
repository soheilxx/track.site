import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CONTACT_REQUEST_STATUSES } from "@track-site/db";
import { Button, Input, Label, Select, buttonVariants } from "@track-site/ui";
import { CONTACT_KINDS, type InboxFilters as Filters, type PlatformOperator } from "@/server/ops/inbox";

/**
 * GET form (works without JavaScript): status, kind, assignee and search live in the URL. Plain labels and
 * controls — no render props cross the server/client boundary.
 */
export async function InboxFilters({ filters, operators, selfId }: { filters: Filters; operators: PlatformOperator[]; selfId: string }) {
  const t = await getTranslations("opsInbox");
  return (
    <form method="get" action="/ops/inbox" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-ink">{t("requests.filters.legend")}</legend>
        <div className="min-w-0">
          <Label htmlFor="inbox-status">{t("requests.filters.status")}</Label>
          <Select id="inbox-status" name="status" defaultValue={filters.status} className="mt-1.5">
            <option value="open">{t("requests.filters.open")}</option>
            <option value="all">{t("requests.filters.all")}</option>
            {CONTACT_REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="inbox-kind">{t("requests.filters.kind")}</Label>
          <Select id="inbox-kind" name="kind" defaultValue={filters.kind} className="mt-1.5">
            <option value="all">{t("requests.filters.all")}</option>
            {CONTACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="inbox-assignee">{t("requests.filters.assignee")}</Label>
          <Select id="inbox-assignee" name="assignee" defaultValue={filters.assignee} className="mt-1.5">
            <option value="all">{t("requests.filters.everyone")}</option>
            <option value="unassigned">{t("requests.filters.unassigned")}</option>
            <option value="me">{t("requests.filters.me")}</option>
            {operators
              .filter((o) => o.id !== selfId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="inbox-q">{t("requests.filters.search")}</Label>
          <Input id="inbox-q" type="search" name="q" defaultValue={filters.q ?? ""} maxLength={80} placeholder={t("requests.filters.searchPlaceholder")} className="mt-1.5" />
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" variant="secondary">
          {t("requests.filters.apply")}
        </Button>
        <Link href="/ops/inbox" className={buttonVariants({ variant: "ghost" })}>
          {t("requests.filters.reset")}
        </Link>
      </div>
    </form>
  );
}
