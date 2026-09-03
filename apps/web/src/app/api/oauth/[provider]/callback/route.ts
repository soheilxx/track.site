import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getConnector } from "@track-site/connectors";
import { getIntegration, oauthConnections, recordAudit, setIntegrationStatus, storeCredential, withTenant } from "@track-site/db";
import { db, vault } from "@/server/db";
import { finishOAuth2, verifyState, xAccessToken } from "@/server/oauth";
import { getOrgContext } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * OAuth callback: verifies the signed state, exchanges the code, stores refresh/access tokens in the vault,
 * records the connection and validates the destination. Tokens never appear in URLs, logs or the chat.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  const q = req.nextUrl.searchParams;
  const stateToken = provider === "x" ? (req.cookies.get("ts_oauth_x")?.value ?? "") : (q.get("state") ?? "");
  const state = verifyState(stateToken);
  if (!state || state.organizationId !== ctx.organization.id || state.provider !== provider || state.userId !== ctx.user.id) return NextResponse.json({ ok: false, code: "STATE_INVALID" }, { status: 400 });
  const back = new URL(`/app/sites/${state.siteId}/destinations/${state.integrationId}`, req.url);
  const v = vault();
  if (!v) return NextResponse.redirect(`${back}?oauth=vault_missing`);
  const integration = await withTenant(db(), ctx.organization.id, (tx) => getIntegration(tx, state.siteId, state.integrationId));
  if (!integration) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  if (q.get("error") || q.get("denied")) return NextResponse.redirect(`${back}?oauth=denied`);

  let stored: { refresh?: string; access?: string; accessExpiresAt?: number | null; tokenSecret?: string; externalId?: string | null; externalName?: string | null } | null = null;
  if (provider === "x") {
    const verifier = q.get("oauth_verifier");
    const requestToken = q.get("oauth_token");
    if (!verifier || !requestToken || !state.requestSecret) return NextResponse.redirect(`${back}?oauth=failed`);
    const t = await xAccessToken(requestToken, state.requestSecret, verifier);
    if (!t) return NextResponse.redirect(`${back}?oauth=failed`);
    stored = { access: t.token, tokenSecret: t.secret, externalId: t.userId, externalName: t.screenName };
  } else {
    const code = q.get("code");
    if (!code) return NextResponse.redirect(`${back}?oauth=failed`);
    const res = await finishOAuth2(provider, code);
    if (!res || !res.accessToken) return NextResponse.redirect(`${back}?oauth=failed`);
    stored = { refresh: res.refreshToken ?? undefined, access: res.accessToken, accessExpiresAt: res.expiresAt };
  }

  const actor = ctx.tenant.actor;
  await withTenant(db(), ctx.organization.id, async (tx) => {
    const ids: { refresh?: string; access?: string } = {};
    if (stored!.refresh) ids.refresh = (await storeCredential(tx, v, { organizationId: ctx.organization.id, integrationId: integration.id, kind: "oauth_refresh_token", label: `${provider} refresh token`, plaintext: stored!.refresh, actor, userId: ctx.user.id })).id;
    if (stored!.access) ids.access = (await storeCredential(tx, v, { organizationId: ctx.organization.id, integrationId: integration.id, kind: "oauth_access_token", label: `${provider} access token`, plaintext: stored!.access, expiresAt: stored!.accessExpiresAt ? new Date(stored!.accessExpiresAt) : null, actor, userId: ctx.user.id })).id;
    if (stored!.tokenSecret) await storeCredential(tx, v, { organizationId: ctx.organization.id, integrationId: integration.id, kind: "oauth_token_secret", label: `${provider} token secret`, plaintext: stored!.tokenSecret, actor, userId: ctx.user.id });
    await tx.delete(oauthConnections).where(eq(oauthConnections.integrationId, integration.id));
    await tx.insert(oauthConnections).values({ organizationId: ctx.organization.id, integrationId: integration.id, provider, externalAccountId: stored!.externalId ?? null, externalAccountName: stored!.externalName ?? null, scopes: [], refreshCredentialId: ids.refresh ?? null, accessCredentialId: ids.access ?? null, accessExpiresAt: stored!.accessExpiresAt ? new Date(stored!.accessExpiresAt) : null, status: "connected" });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor, action: "integration.oauth_connected", targetType: "integration", targetId: integration.id, diff: { provider } });
  });

  // validate immediately with the freshly issued access token (never persisted in plaintext)
  const connector = getConnector(integration.connectorType);
  if (connector) {
    const validation = await connector.validateCredentials({
      organizationId: ctx.organization.id,
      siteId: integration.siteId,
      integrationId: integration.id,
      publicConfig: integration.publicConfig,
      settings: integration.settings,
      testMode: integration.testMode,
      getCredential: async (kind) => (kind === "oauth_access_token" ? (stored?.access ?? null) : kind === "oauth_token_secret" ? (stored?.tokenSecret ?? null) : kind === "oauth_refresh_token" ? (stored?.refresh ?? null) : null),
      fetch,
      baseUrlOverride: process.env.VENDOR_MOCK_BASE_URL ?? null,
      allowPrivateNetwork: process.env.VENDOR_ALLOW_PRIVATE === "true",
      logger: (await import("@track-site/core")).silentLogger(),
      now: () => new Date(),
      platform: { google_ads_developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? null, x_consumer_key: process.env.X_CONSUMER_KEY ?? null, x_consumer_secret: process.env.X_CONSUMER_SECRET ?? null, amazon_ads_client_id: process.env.AMAZON_ADS_CLIENT_ID ?? null },
      oauth: null,
    });
    await withTenant(db(), ctx.organization.id, (tx) => setIntegrationStatus(tx, { siteId: integration.siteId, integrationId: integration.id, status: validation.ok ? "connected" : "error", health: { status: validation.ok ? "healthy" : "unhealthy", checkedAt: validation.checkedAt, detail: validation.detail, apiVersion: validation.apiVersion }, actor }));
  }
  const res = NextResponse.redirect(`${back}?oauth=connected`);
  if (provider === "x") res.cookies.delete("ts_oauth_x");
  return res;
}
