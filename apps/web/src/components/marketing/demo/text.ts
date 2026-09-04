/**
 * Tiny placeholder helpers for the function-free demo copy (`{n}`, `{name}` …). Kept separate from
 * next-intl on purpose: the demo copy is a typed object handed over as a prop.
 */
export type Vars = Record<string, string | number>;

export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export interface PluralForms {
  one: string;
  other: string;
  zero?: string;
}

/** Picks the form for `n` (English/German rules: exactly one vs. everything else) and fills `{n}` plus `vars`. */
export function plural(forms: PluralForms, n: number, vars: Vars = {}): string {
  const template = n === 0 && forms.zero ? forms.zero : n === 1 ? forms.one : forms.other;
  return fill(template, { n, ...vars });
}
