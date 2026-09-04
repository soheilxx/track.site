import type { PluralText } from "@/lib/marketing-copy/knowledge";

/** Placeholder helpers for the function-free hub copy (`{n}`, `{total}`, `{q}` …); usable on the server and in the client island. */
export type Vars = Record<string, string | number>;

export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** English/German plural rule (exactly one vs. everything else) with `{n}` filled in. */
export function plural(forms: PluralText, n: number, vars: Vars = {}): string {
  return fill(n === 1 ? forms.one : forms.other, { n, ...vars });
}

/** "Meta" for a catalogue slug without an entry: `google-marketing-platform` → `Google Marketing Platform`. */
export function humanize(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
