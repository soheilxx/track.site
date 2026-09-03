/**
 * Pattern-based PII and secret detection. Used by the worker PII scanner (block/redact before
 * persistence and dispatch) and by the pre-LLM DLP interceptor (block secrets from reaching the model).
 * Deterministic and conservative: false positives are acceptable, false negatives for secrets are not.
 */
export type PiiKind = "email" | "phone" | "iban" | "card" | "ipv4" | "ipv6" | "secret" | "jwt";

export interface PiiFinding {
  kind: PiiKind;
  /** the matched text, never logged */
  value: string;
  start: number;
  end: number;
  detector: string;
}

interface Detector {
  kind: PiiKind;
  name: string;
  regex: RegExp;
  validate?: (match: string) => boolean;
  /** the match has no vendor prefix of its own, so a public prefix in front of it (e.g. `sha384-`) clears it */
  prefixless?: boolean;
}

const DETECTORS: Detector[] = [
  { kind: "jwt", name: "jwt", regex: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g },
  { kind: "secret", name: "stripe", regex: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "secret", name: "stripe-webhook", regex: /\bwhsec_[A-Za-z0-9]{16,}\b/g },
  { kind: "secret", name: "aws-access-key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    kind: "secret",
    name: "base64-secret",
    // AWS secret access keys (40 chars) and other unprefixed standard-base64 key material (`/` and `+` are
    // not word characters, so the generic run heuristic below cannot see them). Random base64 of this length
    // has an entropy floor around 4.1 (measured over 200k samples); ids, hex digests and URL paths stay below
    // 4.0 or fail the mixed-case requirement. Long camelCase identifiers may be over-redacted, by design.
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+]{40,}={0,2}(?![A-Za-z0-9/+=])/g,
    validate: (m) => /[a-z]/.test(m) && /[A-Z]/.test(m) && entropy(m) >= 4.0,
    prefixless: true,
  },
  { kind: "secret", name: "meta-token", regex: /\bEAA[A-Za-z0-9]{40,}\b/g },
  { kind: "secret", name: "openai", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: "secret", name: "github", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { kind: "secret", name: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "secret", name: "slack", regex: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "secret", name: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { kind: "secret", name: "tracksite-key", regex: /\btsk_(?:live|test)_[A-Za-z0-9_-]{20,}\b/g },
  { kind: "secret", name: "bearer", regex: /\b[Bb]earer\s+[A-Za-z0-9._\-/+]{20,}={0,2}/g },
  {
    kind: "secret",
    name: "generic-token",
    regex: /\b(?:token|secret|api[_-]?key|access[_-]?key|password)\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/gi,
  },
  { kind: "email", name: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  {
    kind: "iban",
    name: "iban",
    regex: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g,
    validate: isIban,
  },
  { kind: "card", name: "card", regex: /\b(?:\d[ -]?){13,19}\b/g, validate: luhn },
  { kind: "phone", name: "phone", regex: /(?:\+|00)\d{1,3}[\s.-]?\(?\d{1,5}\)?(?:[\s.-]?\d{2,5}){2,4}\b/g },
  {
    kind: "ipv4",
    name: "ipv4",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
  { kind: "ipv6", name: "ipv6", regex: /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi },
];

export function luhn(input: string): boolean {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function isIban(input: string): boolean {
  const iban = input.replace(/\s/g, "").toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

/** Shannon entropy per character; used for generic high-entropy secret heuristics. */
export function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** Values that are published on purpose (DNS TXT, meta tag, verification file, subresource integrity hashes); their random part is not a secret. */
const NON_SECRET_PREFIXES = ["track-site-verify=", "sha256-", "sha384-", "sha512-"];

const UUID_SPAN_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ULID_SPAN_RE = /\b[0-9A-HJKMNP-TV-Z]{26}\b/g;

/** Opaque identifiers (UUID, ULID) are never secrets; the generic entropy heuristic must keep them intact. */
export function isOpaqueIdentifier(value: string): boolean {
  return UUID_RE.test(value) || ULID_RE.test(value);
}

/** Digit runs inside UUIDs/ULIDs are parts of an id, not phone or card numbers. */
function identifierSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const re of [UUID_SPAN_RE, ULID_SPAN_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PUBLIC_VALUE_RE = new RegExp(`(?:${NON_SECRET_PREFIXES.map(escapeRe).join("|")})[A-Za-z0-9_\\-/+=]*`, "g");

/** A published prefix plus the token that follows it; nothing inside such a span is a secret. */
function publicSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  PUBLIC_VALUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PUBLIC_VALUE_RE.exec(text)) !== null) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

function inside(spans: Array<[number, number]>, start: number, end: number): boolean {
  return spans.some(([s, e]) => s <= start && end <= e);
}

export function scanForPii(text: string, kinds?: PiiKind[]): PiiFinding[] {
  const findings: PiiFinding[] = [];
  if (!text) return findings;
  const ids = identifierSpans(text);
  const pub = publicSpans(text);
  for (const d of DETECTORS) {
    if (kinds && !kinds.includes(d.kind)) continue;
    d.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = d.regex.exec(text)) !== null) {
      const value = m[1] ?? m[0];
      if (d.validate && !d.validate(m[0])) continue;
      const matchStart = m.index;
      const matchEnd = m.index + m[0].length;
      if (inside(ids, matchStart, matchEnd)) continue;
      if (d.prefixless && inside(pub, matchStart, matchEnd)) continue;
      findings.push({ kind: d.kind, value, start: m.index, end: m.index + m[0].length, detector: d.name });
    }
  }
  if (!kinds || kinds.includes("secret")) {
    const tokenRe = /\b[A-Za-z0-9_-]{32,}\b/g;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(text)) !== null) {
      const v = t[0];
      const start = t.index;
      const end = start + v.length;
      const covered = findings.some((f) => f.start <= start && f.end >= end);
      if (!covered && !isOpaqueIdentifier(v) && !inside(pub, start, end) && /[a-z]/.test(v) && /[A-Z0-9]/.test(v) && entropy(v) >= 3.8) {
        findings.push({ kind: "secret", value: v, start, end, detector: "high-entropy" });
      }
    }
  }
  return findings.sort((a, b) => a.start - b.start);
}

export function containsSecret(text: string): boolean {
  return scanForPii(text, ["secret", "jwt"]).length > 0;
}

/** Replace findings with placeholders, e.g. `[redacted:email]`. Overlapping findings collapse into one placeholder covering their union. */
export function redactPii(text: string, kinds?: PiiKind[]): { text: string; findings: PiiFinding[] } {
  const findings = scanForPii(text, kinds);
  if (findings.length === 0) return { text, findings };
  let out = "";
  let cursor = 0;
  let lastEnd = -1;
  for (const f of findings) {
    if (f.start < lastEnd) {
      // a longer match starting inside an earlier one extends the redacted span instead of leaking its tail
      if (f.end > lastEnd) {
        cursor = f.end;
        lastEnd = f.end;
      }
      continue;
    }
    out += text.slice(cursor, f.start) + `[redacted:${f.kind}]`;
    cursor = f.end;
    lastEnd = f.end;
  }
  out += text.slice(cursor);
  return { text: out, findings };
}

/** Walks a JSON-like value and redacts strings (returns a copy). */
export function redactDeep<T>(value: T, kinds?: PiiKind[]): T {
  if (typeof value === "string") return redactPii(value, kinds).text as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, kinds)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v, kinds);
    return out as T;
  }
  return value;
}
