import { getTranslations } from "next-intl/server";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@track-site/ui";
import { LOCALE_NAMES, isKnownLocale } from "@/i18n/routing";
import type { AutoReplyPreview as AutoReplyPreviewModel } from "@/server/support/settings";

/**
 * What the automatic acknowledgement looks like with the *saved* settings (sender, reply domain): the text is
 * the inbound route's own `acknowledgementText`, laid out by the same `buildTicketMail` (`kind: "auto"`). The
 * sample ticket is marked as such; unsaved edits of the form are not reflected until saved.
 */
export async function AutoReplyPreview({ preview, enabled }: { preview: AutoReplyPreviewModel; enabled: boolean }) {
  const t = await getTranslations("supportMacros.settings.general.preview");
  const language = isKnownLocale(preview.locale) ? LOCALE_NAMES[preview.locale] : preview.locale;
  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("text", { number: String(preview.sample.number), name: preview.sample.requesterName, language })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!enabled ? <Alert tone="info">{t("disabled")}</Alert> : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-3">{t("from")}</dt>
          <dd className="break-all text-ink">{preview.from}</dd>
          <dt className="text-ink-3">{t("replyTo")}</dt>
          <dd className="break-all font-mono text-xs text-ink">{preview.replyTo}</dd>
          <dt className="text-ink-3">{t("subject")}</dt>
          <dd className="text-ink">{preview.subject}</dd>
        </dl>
        <pre className="max-h-96 overflow-auto rounded-[var(--radius-control)] border border-line bg-surface p-3 font-sans text-sm whitespace-pre-wrap text-ink" data-testid="support-auto-reply-preview">
          {preview.text}
        </pre>
      </CardContent>
    </Card>
  );
}
