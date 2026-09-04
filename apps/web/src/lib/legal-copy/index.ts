import type { LocalizedCopy } from "@/lib/marketing-copy/types";
import { LEGAL_EN } from "./en";
import { LEGAL_DE } from "./de";
import { LEGAL_FR } from "./fr";
import { LEGAL_ES } from "./es";
import { LEGAL_IT } from "./it";
import { LEGAL_NL } from "./nl";

/**
 * Legal and trust pages. Operator identity (company, address, contact, DPO) is read from the
 * environment so nothing is invented; missing values render an explicit "to be published" state.
 * The document texts live in one file per language (`./<locale>.ts`, export `LEGAL_<LOCALE>`);
 * pages resolve them with `pick(locale, LEGAL)` from `@/lib/marketing-copy`.
 */
export interface Operator {
  company: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  register: string | null;
  vatId: string | null;
  representatives: string | null;
  dpo: string | null;
}

export function operatorFromEnv(): Operator {
  const e = process.env;
  const v = (k: string) => (e[k] && e[k]!.trim() ? e[k]!.trim() : null);
  return { company: v("LEGAL_COMPANY"), address: v("LEGAL_ADDRESS"), email: v("LEGAL_EMAIL"), phone: v("LEGAL_PHONE"), register: v("LEGAL_REGISTER"), vatId: v("LEGAL_VAT_ID"), representatives: v("LEGAL_REPRESENTATIVES"), dpo: v("LEGAL_DPO") };
}

export interface LegalDoc {
  title: string;
  intro: string;
  /** ISO date of the last revision of this text (shown as "Last updated"); never invented. */
  updated: string;
  sections: Array<{ title: string; paragraphs: string[]; bullets?: string[] }>;
}

export const LEGAL_DOC_IDS = ["security", "privacy", "data-processing", "terms"] as const;
export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

/** The four legal/trust documents of one language. */
export type LegalCopy = Record<LegalDocId, LegalDoc>;

/** Subprocessor list (names, purposes, regions, legal bases are facts, not copy — identical in every language). */
export const SUBPROCESSORS = [
  { name: "Amazon Web Services EMEA SARL", purpose: "Hosting, database, queue, object storage, KMS (eu-central-1)", region: "EU (Frankfurt)", basis: "DPA + SCC" },
  { name: "Stripe Payments Europe Ltd.", purpose: "Subscription billing and invoices", region: "EU / US", basis: "DPA + SCC / DPF" },
  { name: "OpenAI Ireland Ltd.", purpose: "Setup assistant (Responses API, zero data retention, no training)", region: "EU / US", basis: "DPA + SCC / DPF" },
  { name: "Resend, Inc. or the configured SMTP provider", purpose: "Transactional e-mail", region: "EU / US", basis: "DPA + SCC" },
  { name: "Advertising and analytics vendors selected by the customer", purpose: "Event delivery per configured destination", region: "per destination (shown in the wizard)", basis: "customer's own contract with the vendor" },
] as const;

export const LEGAL: LocalizedCopy<LegalCopy> = { en: LEGAL_EN, de: LEGAL_DE, fr: LEGAL_FR, es: LEGAL_ES, it: LEGAL_IT, nl: LEGAL_NL };
