import { redactPii, scanForPii, type PiiFinding } from "@track-site/core";

/**
 * Pre-LLM data-loss-prevention interceptor. Secrets pasted into the chat never reach the model or
 * the transcript; the user is redirected to the secure credential card. Personal data is redacted.
 */
export interface DlpResult {
  /** text safe to send to the model and store in the transcript */
  safeText: string;
  blockedSecret: boolean;
  findings: Array<{ kind: PiiFinding["kind"]; detector: string }>;
  /** best guess which credential kind the user tried to paste, for the secure card */
  suggestedCredential: { connector: string | null; kind: string } | null;
}

const CONNECTOR_HINTS: Array<{ re: RegExp; connector: string; kind: string }> = [
  { re: /\bEAA[A-Za-z0-9]{40,}\b/, connector: "meta", kind: "access_token" },
  { re: /\bsk_(live|test)_/, connector: "stripe", kind: "api_secret" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, connector: "aws", kind: "access_token" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, connector: "google", kind: "api_secret" },
  { re: /\bwhs_/, connector: "webhook", kind: "signing_secret" },
  { re: /tiktok|events api token/i, connector: "tiktok", kind: "access_token" },
  { re: /api secret|measurement protocol/i, connector: "ga4", kind: "api_secret" },
];

export function interceptUserMessage(text: string): DlpResult {
  const secrets = scanForPii(text, ["secret", "jwt"]);
  const { text: redacted, findings } = redactPii(text, ["email", "phone", "card", "iban", "secret", "jwt"]);
  let suggested: DlpResult["suggestedCredential"] = null;
  if (secrets.length) {
    const hint = CONNECTOR_HINTS.find((h) => h.re.test(text));
    suggested = { connector: hint?.connector ?? null, kind: hint?.kind ?? "access_token" };
  }
  return {
    safeText: secrets.length ? redacted + "\n\n[system note: a credential-like value was removed before this message reached the assistant]" : redacted,
    blockedSecret: secrets.length > 0,
    findings: findings.map((f) => ({ kind: f.kind, detector: f.detector })),
    suggestedCredential: suggested,
  };
}

/** Tool outputs are redacted again before they are handed back to the model. */
export function redactToolOutput<T>(value: T): T {
  return JSON.parse(redactPii(JSON.stringify(value), ["secret", "jwt", "email", "phone", "card", "iban"]).text) as T;
}

/** Untrusted content (site scans, vendor responses) is wrapped and size-limited before the model sees it. */
export function wrapUntrusted(label: string, content: string, maxChars = 4_000): string {
  const clipped = content.length > maxChars ? `${content.slice(0, maxChars)}\n[truncated]` : content;
  return `<untrusted source="${label}">\n${redactPii(clipped).text.replace(/<\/?untrusted[^>]*>/gi, "")}\n</untrusted>`;
}
