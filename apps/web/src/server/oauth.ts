import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAUTH_PROVIDERS, authorizationUrl, exchangeCode, oauth1Header, type OAuthProvider } from "@track-site/connectors";
import { env } from "@/env";

/**
 * OAuth connect flows for vendor destinations. State is an HMAC-signed, time-limited token binding the
 * organization, site, integration and provider; tokens are exchanged server-side and stored in the vault.
 */
export interface OAuthState {
  organizationId: string;
  siteId: string;
  integrationId: string;
  provider: string;
  userId: string;
  issuedAt: number;
  /** OAuth 1.0a request-token secret (X) */
  requestSecret?: string;
}

function secret(): string {
  const e = env();
  return e.APPROVAL_TOKEN_SECRET ?? e.AUTH_SECRET ?? "dev-oauth-secret";
}

export function signState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(token: string, maxAgeMs = 15 * 60_000): OAuthState | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (Date.now() - state.issuedAt > maxAgeMs) return null;
    return state;
  } catch {
    return null;
  }
}

export function providerConfig(id: string): { provider: OAuthProvider; clientId: string; clientSecret: string } | null {
  const provider = OAUTH_PROVIDERS[id];
  if (!provider) return null;
  const e = env() as unknown as Record<string, string | undefined>;
  const clientId = e[provider.clientIdEnv];
  const clientSecret = e[provider.clientSecretEnv];
  if (!clientId || !clientSecret) return null;
  return { provider, clientId, clientSecret };
}

export function redirectUri(providerId: string): string {
  return `${env().HOST_APP.replace(/\/$/, "")}/api/oauth/${encodeURIComponent(providerId)}/callback`;
}

export function startUrl(providerId: string, state: OAuthState): string | null {
  const cfg = providerConfig(providerId);
  if (!cfg) return null;
  return authorizationUrl(cfg.provider, cfg.clientId, redirectUri(providerId), signState(state));
}

export async function finishOAuth2(providerId: string, code: string) {
  const cfg = providerConfig(providerId);
  if (!cfg) return null;
  return exchangeCode(cfg.provider, code, cfg.clientId, cfg.clientSecret, redirectUri(providerId));
}

/** X Ads uses OAuth 1.0a (3-legged): request token → authorize → access token + secret. */
export async function xRequestToken(): Promise<{ token: string; secret: string; authorizeUrl: string } | null> {
  const e = env();
  if (!e.X_CONSUMER_KEY || !e.X_CONSUMER_SECRET) return null;
  const url = "https://api.x.com/oauth/request_token";
  const callback = redirectUri("x");
  const header = oauth1Header("POST", `${url}?oauth_callback=${encodeURIComponent(callback)}`, { consumerKey: e.X_CONSUMER_KEY, consumerSecret: e.X_CONSUMER_SECRET, token: "", tokenSecret: "" });
  const res = await fetch(url, { method: "POST", headers: { authorization: header.replace("OAuth ", `OAuth oauth_callback="${encodeURIComponent(callback)}", `) }, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  const params = new URLSearchParams(text);
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  if (!res.ok || !token || !tokenSecret) return null;
  return { token, secret: tokenSecret, authorizeUrl: `https://api.x.com/oauth/authorize?oauth_token=${encodeURIComponent(token)}` };
}

export async function xAccessToken(requestToken: string, requestSecret: string, verifier: string): Promise<{ token: string; secret: string; userId: string | null; screenName: string | null } | null> {
  const e = env();
  if (!e.X_CONSUMER_KEY || !e.X_CONSUMER_SECRET) return null;
  const url = "https://api.x.com/oauth/access_token";
  const header = oauth1Header("POST", `${url}?oauth_verifier=${encodeURIComponent(verifier)}`, { consumerKey: e.X_CONSUMER_KEY, consumerSecret: e.X_CONSUMER_SECRET, token: requestToken, tokenSecret: requestSecret });
  const res = await fetch(`${url}?oauth_verifier=${encodeURIComponent(verifier)}`, { method: "POST", headers: { authorization: header }, signal: AbortSignal.timeout(10_000) });
  const params = new URLSearchParams(await res.text());
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  if (!res.ok || !token || !tokenSecret) return null;
  return { token, secret: tokenSecret, userId: params.get("user_id"), screenName: params.get("screen_name") };
}

export function nonce(): string {
  return randomBytes(12).toString("hex");
}
