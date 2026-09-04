import type { FaqItem } from "@/lib/marketing-copy";

/** Focused question list (dl); the same items feed `faqJsonLd`. */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {items.map((f) => (
        <div key={f.q} className="grid gap-2 py-6 md:grid-cols-12 md:gap-8">
          <dt className="font-semibold text-ink md:col-span-5">{f.q}</dt>
          <dd className="text-body text-ink-2 md:col-span-7">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}

/** schema.org FAQPage mirroring the visible questions only. */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}
