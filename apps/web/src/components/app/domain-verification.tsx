"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Alert, Button } from "@track-site/ui";
import { verifyDomainAction } from "@/server/actions/sites";

type Method = "dns_txt" | "file" | "meta_tag";

export function DomainVerification({ domainId, hostname, token }: { domainId: string; hostname: string; token: string }) {
  const t = useTranslations("app.site");
  const [method, setMethod] = useState<Method>("dns_txt");
  const [state, action, pending] = useActionState(verifyDomainAction, { ok: false, error: null });
  const fileUrl = `https://${hostname}/.well-known/track-site-verify.txt`;
  const metaTag = `<meta name="track-site-verification" content="${token}">`;
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-ink-2">{t("verifyText")}</p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("verifyTitle")}>
        {(["dns_txt", "file", "meta_tag"] as Method[]).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => setMethod(m)} className={`rounded-full border px-3 py-1 text-sm ${method === m ? "border-primary bg-primary-soft text-primary" : "border-line text-ink-2"}`}>
            {m === "dns_txt" ? t("methodDns") : m === "file" ? t("methodFile") : t("methodMeta")}
          </button>
        ))}
      </div>
      <div className="rounded-xl bg-surface-2 p-3 text-sm">
        {method === "dns_txt" ? <p className="text-ink-2">{t("dnsHelp", { host: hostname })}</p> : null}
        {method === "file" ? <p className="text-ink-2">{t("fileHelp", { url: fileUrl })}</p> : null}
        {method === "meta_tag" ? <p className="text-ink-2">{t("metaHelp")}</p> : null}
        <code className="mt-2 block break-all font-mono text-xs text-ink">{method === "meta_tag" ? metaTag : token}</code>
      </div>
      {state.ok ? <Alert tone="ok">{t("checkedOk")}</Alert> : state.detail ? <Alert tone="warn">{t("checkedFail", { detail: state.detail })}</Alert> : null}
      <form action={action}>
        <input type="hidden" name="domainId" value={domainId} />
        <input type="hidden" name="method" value={method} />
        <Button type="submit" size="sm" loading={pending}>
          {t("check")}
        </Button>
      </form>
    </div>
  );
}
