import { Check } from "lucide-react";

/** Features every paid plan includes, straight from the catalogue gates; a list, not a wall of cards. */
export function IncludedStrip({ features, note }: { features: string[]; note: string }) {
  return (
    <div>
      <p className="text-small font-semibold tracking-wide text-ink-3 uppercase">{note}</p>
      <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-small text-ink-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" strokeWidth={2.5} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
