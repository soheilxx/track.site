import OpenAI from "openai";

/**
 * Server-side OpenAI client for the Responses API. The key never leaves the server; the model
 * ids come from environment variables and are verified against the project on startup.
 */
export interface ModelRouting {
  primary: string;
  fast: string;
  complex: string;
}

export function createOpenAI(apiKey: string, options: { baseURL?: string; timeoutMs?: number; maxRetries?: number } = {}): OpenAI {
  return new OpenAI({ apiKey, baseURL: options.baseURL, timeout: options.timeoutMs ?? 60_000, maxRetries: options.maxRetries ?? 2 });
}

export interface ModelAvailability {
  ok: boolean;
  checkedAt: string;
  available: string[];
  missing: string[];
  /** models present in the project that look like suitable replacements (never applied automatically) */
  suggestions: string[];
  error: string | null;
}

/** Uses `GET /v1/models` (List models: read) to verify the configured routing without changing it. */
export async function verifyModelAvailability(client: Pick<OpenAI, "models">, routing: ModelRouting): Promise<ModelAvailability> {
  const wanted = Array.from(new Set([routing.primary, routing.fast, routing.complex]));
  try {
    const ids: string[] = [];
    for await (const m of client.models.list()) ids.push(m.id);
    const missing = wanted.filter((w) => !ids.includes(w));
    const suggestions = missing.length ? ids.filter((id) => /^gpt-5/.test(id) && !wanted.includes(id)).sort() : [];
    return { ok: missing.length === 0, checkedAt: new Date().toISOString(), available: wanted.filter((w) => ids.includes(w)), missing, suggestions, error: null };
  } catch (e) {
    return { ok: false, checkedAt: new Date().toISOString(), available: [], missing: wanted, suggestions: [], error: e instanceof Error ? e.message.slice(0, 200) : "list models failed" };
  }
}
