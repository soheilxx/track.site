import { notFound } from "next/navigation";
import { loadSetupState } from "@track-site/ai";
import { getSite } from "@track-site/db";
import { SetupChat } from "@/components/chat/setup-chat";
import { aiConfigured } from "@/server/ai/context";
import { db } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function SiteSetupPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) notFound();
  const ctx = await requireOrgContext("ai.chat");
  const site = await withOrg(ctx, (tx) => getSite(tx, ctx.organization.id, siteId));
  if (!site) notFound();
  const state = await loadSetupState(db(), ctx.organization.id, site.id, ctx.user.locale);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">{site.name}</h1>
        <p className="text-sm text-ink-3">
          <span className="font-mono">{site.trackingId}</span> · {site.primaryDomain ?? "no domain"}
        </p>
      </div>
      <SetupChat siteId={site.id} aiEnabled={aiConfigured()} locale={ctx.user.locale} initialStep={state.currentStep} />
    </div>
  );
}
