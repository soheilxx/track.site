"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@track-site/ui";

export function snippetFor(trackingId: string, cdnUrl: string, ingestUrl: string): string {
  const isDefault = cdnUrl === "https://cdn.track.site";
  const extra = isDefault ? "" : `\n  data-cdn="${cdnUrl}"\n  data-ingest="${ingestUrl}"`;
  return `<script\n  async\n  src="${cdnUrl}/v1/tracker.js"\n  data-site-id="${trackingId}"${extra}>\n</script>`;
}

export function Snippet({ trackingId, cdnUrl, ingestUrl }: { trackingId: string; cdnUrl: string; ingestUrl: string }) {
  const t = useTranslations("app.site");
  const [copied, setCopied] = useState(false);
  const code = snippetFor(trackingId, cdnUrl, ingestUrl);
  return (
    <div>
      <pre className="overflow-x-auto rounded-xl border border-line bg-surface-2 p-4 font-mono text-xs text-ink">
        <code>{code}</code>
      </pre>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}
