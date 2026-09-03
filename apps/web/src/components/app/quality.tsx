"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@track-site/ui";
import type { ActionState } from "@/server/actions/organization";
import { setIssueStatusAction } from "@/server/actions/quality";

const initial: ActionState = { ok: false, error: null };

export function IssueActions({ issueId, status, siteId }: { issueId: string; status: string; siteId: string }) {
  const t = useTranslations("app.quality");
  const [, action, pending] = useActionState(setIssueStatusAction, initial);
  return (
    <div className="flex items-center gap-2">
      <Link href={`/app/sites/${siteId}/setup`} className="text-xs text-primary hover:underline">
        {t("openAssistant")}
      </Link>
      {status === "open" ? (
        <>
          <form action={action}>
            <input type="hidden" name="issueId" value={issueId} />
            <input type="hidden" name="status" value="resolved" />
            <Button type="submit" size="sm" variant="secondary" loading={pending}>
              {t("resolve")}
            </Button>
          </form>
          <form action={action}>
            <input type="hidden" name="issueId" value={issueId} />
            <input type="hidden" name="status" value="ignored" />
            <Button type="submit" size="sm" variant="ghost" loading={pending}>
              {t("ignore")}
            </Button>
          </form>
        </>
      ) : (
        <form action={action}>
          <input type="hidden" name="issueId" value={issueId} />
          <input type="hidden" name="status" value="open" />
          <Button type="submit" size="sm" variant="ghost" loading={pending}>
            {t("reopen")}
          </Button>
        </form>
      )}
    </div>
  );
}
