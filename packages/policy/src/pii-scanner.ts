import { redactPii, scanForPii, type PiiKind } from "@track-site/core";
import type { CanonicalEvent } from "@track-site/events";

/**
 * Event-level PII scanner. Runs after normalization, before the policy engine.
 * Free-text fields (props, title, search terms) must not contain emails, phones, cards, IBANs or secrets.
 * Findings are redacted in place and reported as data-quality issues; secrets and cards block the event.
 */
export interface PiiScanResult {
  event: CanonicalEvent;
  findings: Array<{ field: string; kind: PiiKind }>;
  blocked: boolean;
}

const BLOCKING: PiiKind[] = ["card", "secret", "jwt", "iban"];
const SCAN_KINDS: PiiKind[] = ["email", "phone", "card", "iban", "secret", "jwt"];

export function scanEventForPii(event: CanonicalEvent): PiiScanResult {
  const findings: PiiScanResult["findings"] = [];
  let blocked = false;
  const copy: CanonicalEvent = { ...event };

  const scanString = (field: string, value: string | null): string | null => {
    if (!value) return value;
    const { text, findings: f } = redactPii(value, SCAN_KINDS);
    for (const x of f) {
      findings.push({ field, kind: x.kind });
      if (BLOCKING.includes(x.kind)) blocked = true;
    }
    return text;
  };

  copy.title = scanString("title", event.title);
  copy.url = scanString("url", event.url);
  copy.referrer = scanString("referrer", event.referrer);
  if (event.props) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(event.props)) {
      if (typeof v === "string") props[k] = scanString(`props.${k}`, v);
      else if (v && typeof v === "object") {
        const json = JSON.stringify(v);
        const f = scanForPii(json, SCAN_KINDS);
        if (f.length) {
          for (const x of f) {
            findings.push({ field: `props.${k}`, kind: x.kind });
            if (BLOCKING.includes(x.kind)) blocked = true;
          }
          props[k] = "[redacted:nested]";
        } else props[k] = v;
      } else props[k] = v;
    }
    copy.props = props as CanonicalEvent["props"];
  }
  if (event.commerce?.items) {
    copy.commerce = {
      ...event.commerce,
      items: event.commerce.items.map((it) => ({ ...it, item_name: scanString("commerce.items.item_name", it.item_name ?? null) })),
    };
  }
  if (blocked) {
    copy.processing_state = "rejected";
    copy.drop_reason = "pii_blocked";
  }
  return { event: copy, findings, blocked };
}
