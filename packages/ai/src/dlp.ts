import { redactPii, scanForPii, type PiiFinding, type PiiKind } from "@track-site/core";

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

const TOOL_OUTPUT_KINDS: PiiKind[] = ["secret", "jwt", "email", "phone", "card", "iban"];
/** Under identifier keys only real secrets are hidden: pixel/measurement ids and UUIDs are neither cards nor phone numbers. */
const IDENTIFIER_KINDS: PiiKind[] = ["secret", "jwt"];
const IDENTIFIER_KEY_RE = /(?:^|_)ids?$/i;
const PUBLIC_CONFIG_KEY = "public_config";

/** What the model sees in place of an approval token; the real token only ever reaches the UI confirmation. */
export const APPROVAL_TOKEN_PLACEHOLDER = "[approval token withheld: the user confirms through the approval card]";

function isApprovalTokenField(key: string | null, parentKey: string | null): boolean {
  return key === "approval_token" || (key === "token" && parentKey === "approval");
}

function redactWalk(value: unknown, key: string | null, parentKey: string | null, identifierContext: boolean): unknown {
  if (isApprovalTokenField(key, parentKey)) return value === null || value === undefined ? value : APPROVAL_TOKEN_PLACEHOLDER;
  if (typeof value === "string") return redactPii(value, identifierContext ? IDENTIFIER_KINDS : TOOL_OUTPUT_KINDS).text;
  if (Array.isArray(value)) return value.map((v) => redactWalk(v, key, parentKey, identifierContext));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // keys are serialised too: a map keyed by ids stays intact, a secret used as a key is replaced like a value
      out[redactPii(k, IDENTIFIER_KINDS).text] = redactWalk(v, k, key, identifierContext || IDENTIFIER_KEY_RE.test(k) || k === PUBLIC_CONFIG_KEY);
    }
    return out;
  }
  return value;
}

/**
 * Tool outputs are redacted again before they are handed back to the model or persisted: secrets and
 * personal data are replaced (in values, object keys and result messages alike) and approval tokens are
 * withheld, while identifiers (UUIDs, draft ids, pixel ids, domain verification tokens) stay intact so
 * the model can pass them on to other tools.
 * The value is normalised the way the transport would serialise it (dates become strings).
 */
export function redactToolOutput<T>(value: T): T {
  if (value === undefined) return value;
  return redactWalk(JSON.parse(JSON.stringify(value)) as unknown, null, null, false) as T;
}

/** Untrusted content (site scans, vendor responses) is wrapped and size-limited before the model sees it. */
export function wrapUntrusted(label: string, content: string, maxChars = 4_000): string {
  const clipped = content.length > maxChars ? `${content.slice(0, maxChars)}\n[truncated]` : content;
  return `<untrusted source="${label}">\n${redactPii(clipped).text.replace(/<\/?untrusted[^>]*>/gi, "")}\n</untrusted>`;
}
