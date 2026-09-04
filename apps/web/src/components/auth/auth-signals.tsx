import { Globe, KeyRound, ShieldCheck } from "lucide-react";
import { cn } from "@track-site/ui";
import type { AuthSignal } from "@/lib/marketing-copy/types";

const ICONS = { passkey: KeyRound, eu: Globe, consent: ShieldCheck } as const;

/**
 * Short privacy/security signals (supplement §4). Every item is a verifiable product fact from
 * AUTH_COPY; icons are decorative, the text carries the information. Token-driven, so the same list
 * renders on the ground and inside the dark product stage.
 */
export function AuthSignals({ items, layout = "list", className }: { items: readonly AuthSignal[]; layout?: "list" | "row"; className?: string }) {
  return (
    <ul className={cn("grid gap-4", layout === "row" && "sm:grid-cols-3 sm:gap-6", className)}>
      {items.map((signal) => {
        const Icon = ICONS[signal.icon];
        return (
          <li key={signal.icon} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control-sm)] bg-primary-soft text-primary">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{signal.title}</span>
              <span className="mt-0.5 block text-sm text-ink-3">{signal.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
