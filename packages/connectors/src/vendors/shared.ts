import type { CanonicalEvent } from "@track-site/events";
import type { ConnectorContext, DispatchResult, ErrorClass, VendorPayload } from "../connector.ts";

/** Drops null/undefined/empty values so vendor payloads only carry known data. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export function eventSeconds(e: CanonicalEvent): number {
  return Math.floor(new Date(e.client_ts ?? e.server_ts).getTime() / 1000);
}

export function eventMillis(e: CanonicalEvent): number {
  return new Date(e.client_ts ?? e.server_ts).getTime();
}

export function ageDays(e: CanonicalEvent, now = Date.now()): number {
  return (now - eventMillis(e)) / 86_400_000;
}

/** Offline / CRM imports arrive through the server API or legacy imports and are flagged in props.offline. */
export function isOffline(e: CanonicalEvent): boolean {
  return e.source === "legacy-import" || e.props?.offline === true;
}

export function marketingGranted(e: CanonicalEvent): boolean {
  return e.consent.granted.includes("marketing");
}

export function prop(e: CanonicalEvent, key: string): string | null {
  const v = e.props?.[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}

export function contents(e: CanonicalEvent): Array<{ id: string; quantity: number; item_price: number | null; name: string | null; category: string | null }> {
  return (e.commerce?.items ?? []).map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1, item_price: i.price ?? null, name: i.item_name ?? null, category: i.category ?? null }));
}

export function numItems(e: CanonicalEvent): number | null {
  const items = e.commerce?.items ?? [];
  return items.length ? items.reduce((n, i) => n + (i.quantity ?? 1), 0) : (e.commerce?.quantity ?? null);
}

export function orderId(e: CanonicalEvent): string | null {
  return e.commerce?.order_id ?? e.commerce?.transaction_id ?? null;
}

export function missingCredential(eventId: string, kind: string): DispatchResult {
  return { ok: false, httpStatus: null, errorClass: "credential_expired", errorCode: `missing_${kind}`, message: `Credential ${kind} missing or revoked`, retryAfterMs: null, vendorEventId: null, responseExcerpt: null, durationMs: 0, eventId };
}

export function failed(eventId: string, errorClass: ErrorClass, errorCode: string, message: string, httpStatus: number | null = null, durationMs = 0): DispatchResult {
  return { ok: false, httpStatus, errorClass, errorCode, message: message.slice(0, 500), retryAfterMs: null, vendorEventId: null, responseExcerpt: message.slice(0, 300), durationMs, eventId };
}

export function succeeded(eventId: string, httpStatus: number, durationMs: number, vendorEventId: string | null = null, excerptText: string | null = null): DispatchResult {
  return { ok: true, httpStatus, errorClass: "none", errorCode: null, message: null, retryAfterMs: null, vendorEventId, responseExcerpt: excerptText, durationMs, eventId };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function mockOrReal(ctx: ConnectorContext, mockPath: string, real: string): string {
  return ctx.baseUrlOverride ? `${ctx.baseUrlOverride.replace(/\/$/, "")}${mockPath}` : real;
}

export function previewOf(body: Record<string, unknown>, hashedKeys: string[]): Record<string, unknown> {
  const clone = structuredClone(body) as Record<string, unknown>;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (hashedKeys.includes(k) && v) (node as Record<string, unknown>)[k] = "[hashed]";
      else walk(v);
    }
  };
  walk(clone);
  return clone;
}

export function payloadEvents(p: VendorPayload): unknown[] {
  const b = p.body as { data?: unknown[] };
  return Array.isArray(b?.data) ? b.data : [];
}
