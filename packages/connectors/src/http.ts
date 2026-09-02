import { parseRetryAfterMs } from "@track-site/core";
import type { ConnectorContext, DispatchResult, ErrorClass } from "./connector.ts";

export interface VendorResponse {
  status: number | null;
  text: string;
  json: unknown;
  headers: Record<string, string>;
  durationMs: number;
  error: "timeout" | "network" | null;
}

/** Vendor request with timeout and no redirects; the caller classifies the outcome. */
export async function vendorRequest(
  ctx: ConnectorContext,
  input: { url: string; method: "POST" | "GET" | "PUT"; headers: Record<string, string>; body?: string; timeoutMs?: number },
): Promise<VendorResponse> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  try {
    const res = await ctx.fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    return { status: res.status, text, json, headers, durationMs: Date.now() - started, error: null };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { status: null, text: "", json: null, headers: {}, durationMs: Date.now() - started, error: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export function classifyHttpStatus(status: number | null, error: VendorResponse["error"] = null): ErrorClass {
  if (error === "timeout") return "timeout";
  if (error === "network" || status === null) return "temporary";
  if (status >= 200 && status < 300) return "none";
  if (status === 401 || status === 403) return "auth";
  if (status === 408 || status === 425 || status === 429) return status === 429 ? "rate_limited" : "temporary";
  if (status >= 500) return "temporary";
  if (status === 400 || status === 422) return "invalid_payload";
  return "permanent";
}

export function excerpt(text: string, max = 300): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, " ").slice(0, max);
}

export function resultFromResponse(eventId: string, res: VendorResponse, errorClass: ErrorClass, extra: Partial<DispatchResult> = {}): DispatchResult {
  return {
    ok: errorClass === "none",
    httpStatus: res.status,
    errorClass,
    errorCode: errorClass === "none" ? null : `http_${res.status ?? res.error}`,
    message: errorClass === "none" ? null : (excerpt(res.text, 200) ?? res.error),
    retryAfterMs: parseRetryAfterMs(res.headers["retry-after"]),
    vendorEventId: null,
    responseExcerpt: excerpt(res.text),
    durationMs: res.durationMs,
    eventId,
    ...extra,
  };
}
