"use client";

import { useActionState, useId } from "react";
import { Alert, Button, Field, Input, Textarea, cn } from "@track-site/ui";
import { submitContactAction, type ContactState } from "@/server/actions/contact";

const initial: ContactState = { ok: false, error: null };

export interface ContactFormCopy {
  name: string;
  email: string;
  company: string;
  message: string;
  submit: string;
  sent: string;
  invalid: string;
  rateLimited: string;
  generic: string;
  privacy: string;
}

/**
 * Contact / demo / support request form. Posts to `submitContactAction` (server action with
 * validation, honeypot, rate limit and persistence); the field names are the action's contract.
 * Labels, hints and errors are wired through the design-system <Field>; the outcome is announced
 * by the <Alert> roles.
 */
export function ContactForm({ kind, locale, topic, copy, messagePlaceholder, className }: { kind: "contact" | "demo" | "support"; locale: string; topic?: string; copy: ContactFormCopy; messagePlaceholder?: string; className?: string }) {
  const [state, action, pending] = useActionState(submitContactAction, initial);
  const uid = useId();
  const id = (name: string) => `cf-${name}-${uid}`;
  if (state.ok) return <Alert tone="ok">{copy.sent}</Alert>;
  return (
    <form action={action} className={cn("space-y-5", className)}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="locale" value={locale} />
      {topic ? <input type="hidden" name="topic" value={topic} /> : null}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={id("website")}>Website</label>
        <input id={id("website")} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.error ? <Alert tone="bad">{state.error === "invalid" ? copy.invalid : state.error === "rate_limited" ? copy.rateLimited : copy.generic}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={id("name")} label={copy.name} required>
          {(control) => <Input {...control} name="name" minLength={2} maxLength={120} autoComplete="name" />}
        </Field>
        <Field id={id("email")} label={copy.email} required>
          {(control) => <Input {...control} type="email" name="email" autoComplete="email" />}
        </Field>
      </div>
      <Field id={id("company")} label={copy.company}>
        {(control) => <Input {...control} name="company" maxLength={120} autoComplete="organization" />}
      </Field>
      <Field id={id("message")} label={copy.message} required>
        {(control) => <Textarea {...control} name="message" minLength={10} maxLength={4000} rows={6} placeholder={messagePlaceholder} />}
      </Field>
      <p id={id("privacy")} className="text-small text-ink-3">
        {copy.privacy}
      </p>
      <Button type="submit" size="lg" loading={pending} aria-describedby={id("privacy")}>
        {copy.submit}
      </Button>
    </form>
  );
}
