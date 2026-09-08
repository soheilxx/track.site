import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonVariants, cn } from "@track-site/ui";

/**
 * Button-styled link to a live public page (same origin, locale-prefixed) or a vendor site. Opens in a new tab
 * so the operator keeps the console; the new-tab behaviour is announced with visually hidden text.
 */
export async function LiveLink({ href, children, label, size = "sm", variant = "secondary", className }: { href: string; children: ReactNode; label?: string; size?: "sm" | "md"; variant?: "secondary" | "ghost"; className?: string }) {
  const t = await getTranslations("opsContent.common");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label ? `${label} ${t("opensNewTab")}` : undefined} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
      <ExternalLink className="size-3.5" aria-hidden="true" />
      {label ? null : <span className="sr-only"> {t("opensNewTab")}</span>}
    </a>
  );
}
