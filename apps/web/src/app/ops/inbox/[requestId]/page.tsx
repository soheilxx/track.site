import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@track-site/ui";
import { AssignForm } from "@/components/ops/inbox/assign-form";
import { ReplyForm } from "@/components/ops/inbox/reply-form";
import { RequestDetail } from "@/components/ops/inbox/request-detail";
import { StatusActions } from "@/components/ops/inbox/status-actions";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { LOCALE_NAMES, isKnownLocale } from "@/i18n/routing";
import { getMailCopy, renderMail } from "@/server/mail/templates";
import { CONFIRMED_TRANSITIONS, CONTACT_TRANSITIONS, loadContactRequest, loadPlatformOperators } from "@/server/ops/inbox";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ops.pages.inbox");
  return { title: t("title") };
}

/**
 * One contact request: the message and its facts, the status workflow (spam behind a confirmation), the
 * assignee and the e-mail reply in the requester's language. Every mutation is a server action with audit
 * entry; the trail below the facts shows them.
 */
export default async function OpsInboxRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const { requestId } = await params;
  const [t, locale, request, operators] = await Promise.all([getTranslations("opsInbox"), platformLocale(ctx.user), loadContactRequest(ctx, requestId), loadPlatformOperators(ctx)]);
  if (!request) notFound();
  const now = new Date().toISOString();
  const operatorNames = new Map(operators.map((o) => [o.id, o.name]));
  const subject = renderMail(getMailCopy(request.locale).contactReply, { name: request.name, body: "", operator: ctx.user.name, reference: request.reference }).subject;
  const language = isKnownLocale(request.locale) ? LOCALE_NAMES[request.locale] : request.locale;
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("detail.title", { kind: t(`kinds.${request.kind}`), name: request.name })}
        context={
          <span className="font-mono text-xs text-ink-3">
            {t("detail.reference")}: {request.reference}
          </span>
        }
        actions={
          <Link href="/ops/inbox" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("detail.back")}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <RequestDetail request={request} locale={locale} now={now} operatorNames={operatorNames} />

        <div className="space-y-6">
          <section aria-labelledby="inbox-status-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
            <h2 id="inbox-status-title" className="text-base font-semibold text-ink">
              {t("detail.status.title")}
            </h2>
            <div className="mt-3">
              <StatusActions requestId={request.id} status={request.status} transitions={[...CONTACT_TRANSITIONS[request.status]]} confirmRequired={[...CONFIRMED_TRANSITIONS]} />
            </div>
          </section>

          <section aria-labelledby="inbox-assign-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
            <h2 id="inbox-assign-title" className="text-base font-semibold text-ink">
              {t("detail.assign.title")}
            </h2>
            <div className="mt-3">
              <AssignForm requestId={request.id} assigneeId={request.assignee?.id ?? null} operators={operators.map((o) => ({ id: o.id, name: o.name }))} selfId={ctx.user.id} />
            </div>
          </section>

          <section aria-labelledby="inbox-reply-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
            <h2 id="inbox-reply-title" className="text-base font-semibold text-ink">
              {t("detail.reply.title")}
            </h2>
            <div className="mt-3">
              <ReplyForm requestId={request.id} email={request.email} subject={subject} language={language} reference={request.reference} disabled={request.status === "spam"} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
