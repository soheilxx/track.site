"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label, Textarea } from "@track-site/ui";
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

export function ContactForm({ kind, locale, topic, copy, messagePlaceholder }: { kind: "contact" | "demo" | "support"; locale: string; topic?: string; copy: ContactFormCopy; messagePlaceholder?: string }) {
  const [state, action, pending] = useActionState(submitContactAction, initial);
  if (state.ok) return <Alert tone="ok">{copy.sent}</Alert>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="locale" value={locale} />
      {topic ? <input type="hidden" name="topic" value={topic} /> : null}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.error ? <Alert tone="bad">{state.error === "invalid" ? copy.invalid : state.error === "rate_limited" ? copy.rateLimited : copy.generic}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cf-name">{copy.name}</Label>
          <Input id="cf-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="cf-email">{copy.email}</Label>
          <Input id="cf-email" name="email" type="email" required autoComplete="email" className="mt-1" />
        </div>
      </div>
      <div>
        <Label htmlFor="cf-company">{copy.company}</Label>
        <Input id="cf-company" name="company" maxLength={120} autoComplete="organization" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="cf-message">{copy.message}</Label>
        <Textarea id="cf-message" name="message" required minLength={10} maxLength={4000} rows={6} className="mt-1" placeholder={messagePlaceholder} />
      </div>
      <p className="text-xs text-ink-3">{copy.privacy}</p>
      <Button type="submit" loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}
