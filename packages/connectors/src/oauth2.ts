/**
 * OAuth 2.0 refresh-token grants for vendor APIs. Refresh tokens live encrypted in the credentials table;
 * client ids/secrets are platform-level (environment / secret manager) and never tenant-visible.
 * Access tokens are short-lived and cached in memory per integration.
 */
export interface OAuthProvider {
  id: string;
  tokenUrl: string;
  /** authorization endpoint for the connect flow */
  authUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  /** extra token-request parameters */
  extra?: Record<string, string>;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: { id: "google", tokenUrl: "https://oauth2.googleapis.com/token", authUrl: "https://accounts.google.com/o/oauth2/v2/auth", scopes: ["https://www.googleapis.com/auth/adwords"], clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID", clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET", extra: { access_type: "offline", prompt: "consent" } },
  google_cm360: { id: "google_cm360", tokenUrl: "https://oauth2.googleapis.com/token", authUrl: "https://accounts.google.com/o/oauth2/v2/auth", scopes: ["https://www.googleapis.com/auth/ddmconversions"], clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID", clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET", extra: { access_type: "offline", prompt: "consent" } },
  amazon: { id: "amazon", tokenUrl: "https://api.amazon.com/auth/o2/token", authUrl: "https://www.amazon.com/ap/oa", scopes: ["advertising::campaign_management"], clientIdEnv: "AMAZON_ADS_CLIENT_ID", clientSecretEnv: "AMAZON_ADS_CLIENT_SECRET" },
  linkedin: { id: "linkedin", tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken", authUrl: "https://www.linkedin.com/oauth/v2/authorization", scopes: ["rw_conversions", "r_ads"], clientIdEnv: "LINKEDIN_CLIENT_ID", clientSecretEnv: "LINKEDIN_CLIENT_SECRET" },
};

export interface RefreshResult {
  accessToken: string | null;
  expiresAt: number | null;
  refreshToken: string | null;
  status: number | null;
  error: string | null;
}

export async function refreshAccessToken(provider: OAuthProvider, refreshToken: string, clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch, tokenUrl = provider.tokenUrl): Promise<RefreshResult> {
  const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret });
  try {
    const res = await fetchImpl(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form.toString(), signal: AbortSignal.timeout(10_000) });
    const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string } | null;
    if (!res.ok || !json?.access_token) return { accessToken: null, expiresAt: null, refreshToken: null, status: res.status, error: json?.error_description ?? json?.error ?? `http_${res.status}` };
    return { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000, refreshToken: json.refresh_token ?? null, status: res.status, error: null };
  } catch (err) {
    return { accessToken: null, expiresAt: null, refreshToken: null, status: null, error: err instanceof Error ? err.message : "network" };
  }
}

export function authorizationUrl(provider: OAuthProvider, clientId: string, redirectUri: string, state: string): string {
  const u = new URL(provider.authUrl);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", provider.scopes.join(" "));
  u.searchParams.set("state", state);
  for (const [k, v] of Object.entries(provider.extra ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

export async function exchangeCode(provider: OAuthProvider, code: string, clientId: string, clientSecret: string, redirectUri: string, fetchImpl: typeof fetch = fetch, tokenUrl = provider.tokenUrl): Promise<RefreshResult> {
  const form = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri });
  try {
    const res = await fetchImpl(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form.toString(), signal: AbortSignal.timeout(10_000) });
    const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string } | null;
    if (!res.ok || !json?.access_token) return { accessToken: null, expiresAt: null, refreshToken: null, status: res.status, error: json?.error_description ?? json?.error ?? `http_${res.status}` };
    return { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000, refreshToken: json.refresh_token ?? null, status: res.status, error: null };
  } catch (err) {
    return { accessToken: null, expiresAt: null, refreshToken: null, status: null, error: err instanceof Error ? err.message : "network" };
  }
}

/** In-memory access-token cache used by the worker (per integration + provider). */
export class AccessTokenCache {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();

  get(key: string): string | null {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
    return null;
  }

  set(key: string, token: string, expiresAt: number): void {
    this.cache.set(key, { token, expiresAt });
  }

  clear(key: string): void {
    this.cache.delete(key);
  }
}
