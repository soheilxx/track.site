import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { EmptyState, buttonVariants } from "@track-site/ui";
import { NewTicketForm } from "@/components/app/support/new-ticket-form";
import { SupportPageHeader } from "@/components/app/support/page-header";
import { requireOrgContext } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportPortal");
  return { title: t("form.title") };
}

/** New ticket (`/app/support/new`): the form for roles with `support.write`; everyone else sees why they cannot open one. */
export default async function NewTicketPage() {
  const ctx = await requireOrgContext("support.read");
  const [t, locale] = await Promise.all([getTranslations("supportPortal"), getLocale()]);
  const canWrite = can(ctx.role, "support.write") && !ctx.readOnly;
  return (
    <div className="space-y-6">
      <SupportPageHeader
        title={t("form.title")}
        intro={t("form.intro")}
        actions={
          <Link href="/app/support" className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("form.back")}
          </Link>
        }
      />
      {canWrite ? <NewTicketForm requester={{ name: ctx.user.name, email: ctx.user.email }} locale={locale} /> : <EmptyState title={t("errors.forbidden")} description={t("list.readOnly")} />}
    </div>
  );
}
