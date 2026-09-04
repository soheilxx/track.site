import { normalizeDomainInput } from "@track-site/core/url";

/**
 * Domain hand-over from the hero (supplement §4): the start page validates the domain, stores it
 * under `ONBOARDING_DOMAIN_KEY` and passes it as `?domain=` to signup; signup carries it into the
 * verification callback and onboarding. Every hop re-validates the candidate here, so an untrusted
 * query string or storage value can only ever become a bare, lower-case hostname or nothing.
 *
 * `@track-site/core/url` is a pure module (no Node APIs), so this file is safe in client components.
 */
export const ONBOARDING_DOMAIN_KEY = "ts-onboarding-domain";

/** Validated hostname from an untrusted candidate (query param, storage, form value), or null. */
export function safeDomain(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  const value = candidate.trim();
  if (!value || value.length > 253) return null;
  return normalizeDomainInput(value);
}

/** Domain remembered by the start page in this tab, if it is still valid. */
export function readStoredDomain(): string | null {
  try {
    return safeDomain(sessionStorage.getItem(ONBOARDING_DOMAIN_KEY));
  } catch {
    return null; // no storage (SSR, private mode): the query string is the only source
  }
}

/** Remember a validated domain for the rest of the onboarding in this tab. */
export function storeDomain(domain: string | null): void {
  try {
    if (domain) sessionStorage.setItem(ONBOARDING_DOMAIN_KEY, domain);
  } catch {
    /* storage unavailable: the domain still travels in the URL */
  }
}

/** `?domain=` query suffix for a validated domain (empty string when there is none). */
export function domainQuery(domain: string | null, first = true): string {
  return domain ? `${first ? "?" : "&"}domain=${encodeURIComponent(domain)}` : "";
}
