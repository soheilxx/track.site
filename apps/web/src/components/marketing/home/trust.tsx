import { Lock, MapPin, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { HomeSection } from "./section";

const ICONS = [ShieldCheck, Lock, MapPin];

/** Consent, security and EU-data facts as a compact fact table with links to the legal/security pages. */
export function HomeTrust({ copy }: { copy: HomeCopy }) {
  const c = copy.trustSection;
  return (
    <HomeSection id="trust" eyebrow={c.eyebrow} title={c.title} text={c.text}>
      <dl className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line md:grid-cols-3">
        {c.groups.map((g, i) => {
          const Icon = ICONS[i] ?? ShieldCheck;
          return (
            <div key={g.title} className="bg-surface p-6">
              <dt className="flex items-center gap-2 text-small font-semibold text-ink">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {g.title}
              </dt>
              {g.items.map((item) => (
                <dd key={item} className="mt-3 flex gap-2 text-small text-ink-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ok" />
                  <span>{item}</span>
                </dd>
              ))}
            </div>
          );
        })}
      </dl>
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-small font-medium">
        {(
          [
            ["/security", c.links.security],
            ["/privacy", c.links.privacy],
            ["/data-processing", c.links.dpa],
            ["/subprocessors", c.links.subprocessors],
          ] as const
        ).map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
