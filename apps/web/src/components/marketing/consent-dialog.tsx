"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import { Button, Checkbox, Dialog } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/marketing-copy/pick";
import { CONSENT_COPY } from "@/lib/marketing-copy/shared";

/**
 * Consent / cookie dialog (docs/12 §3; supplement §3 "Consent-/Cookie-Dialog").
 *
 * NOT MOUNTED on the marketing site, on purpose. Audit of 2026-09-04 over `app/[locale]/**`,
 * `components/marketing/**`, `components/theme-script.tsx`, `app/fonts.ts` and `next.config.ts`:
 *
 * - No analytics, advertising or other third-party script is loaded on the public pages; the Track
 *   tracker snippet itself appears only as a code sample in the docs, it is not installed here.
 * - `NEXT_LOCALE` cookie: written only when the visitor picks a language in the switcher (a
 *   user-requested preference the site needs to honour that choice — strictly necessary, exempt from
 *   consent under ePrivacy Art. 5(3)); it is never used for detection or redirects beyond that.
 * - `ts-theme` (localStorage, theme-script.tsx) and `ts-onboarding-domain` (sessionStorage,
 *   domain-start-form.tsx): preferences set by the visitor's own action, read only by this site.
 * - Session/auth cookies exist only after a login (strictly necessary); Stripe.js loads in the
 *   dashboard checkout, not on marketing pages; fonts are self-hosted by next/font, so no request
 *   reaches Google at runtime.
 *
 * With nothing optional to consent to, a banner would be noise and would ask for a consent that is
 * not needed. The component is complete so it can be mounted the day something optional is added:
 * mount it in `app/[locale]/layout.tsx`, open it when no decision is stored, persist the decision
 * (a first-party cookie with a bounded lifetime) and gate the optional script on `decision.<category>`.
 * Closing the dialog (Escape, ✕, overlay) counts as "decline optional": nothing is granted silently.
 * `MARKETING_SITE_USES_OPTIONAL_STORAGE` documents the current state for tests and reviewers.
 */
export const MARKETING_SITE_USES_OPTIONAL_STORAGE = false as const;

export interface ConsentDecision {
  analytics: boolean;
  marketing: boolean;
}

export interface ConsentDialogProps {
  open: boolean;
  /** Called exactly once per interaction with the categories the visitor allowed. */
  onDecision: (decision: ConsentDecision) => void;
  /** Pre-selection when re-opened from a settings link. */
  initial?: ConsentDecision;
}

const NONE: ConsentDecision = { analytics: false, marketing: false };
const ALL: ConsentDecision = { analytics: true, marketing: true };

export function ConsentDialog({ open, onDecision, initial = NONE }: ConsentDialogProps) {
  const locale = useLocale();
  const copy = pick(locale, CONSENT_COPY);
  const [analytics, setAnalytics] = useState(initial.analytics);
  const [marketing, setMarketing] = useState(initial.marketing);

  const decide = (decision: ConsentDecision) => {
    setAnalytics(decision.analytics);
    setMarketing(decision.marketing);
    onDecision(decision);
  };

  return (
    <Dialog
      open={open}
      onClose={() => decide(NONE)}
      title={copy.title}
      description={copy.description}
      closeLabel={copy.close}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => decide(NONE)}>
            {copy.declineOptional}
          </Button>
          <Button variant="secondary" onClick={() => decide({ analytics, marketing })}>
            {copy.save}
          </Button>
          <Button onClick={() => decide(ALL)}>{copy.acceptAll}</Button>
        </>
      }
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">{copy.title}</legend>
        <Checkbox checked readOnly disabled label={copy.categories.necessary.label} description={copy.categories.necessary.text} />
        <Checkbox checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} label={copy.categories.analytics.label} description={copy.categories.analytics.text} />
        <Checkbox checked={marketing} onChange={(event) => setMarketing(event.target.checked)} label={copy.categories.marketing.label} description={copy.categories.marketing.text} />
      </fieldset>
      <p className="mt-3 text-small text-ink-3">
        <Link href={copy.privacy.href} className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          {copy.privacy.label}
        </Link>
      </p>
    </Dialog>
  );
}
