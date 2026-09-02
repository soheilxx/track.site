import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { containsSecret, silentLogger } from "@track-site/core";
import { getConnector } from "@track-site/connectors";
import { getIntegration, listCredentialRefs, setIntegrationStatus, storeCredential, withTenant } from "@track-site/db";
import { db, vault } from "@/server/db";
import { env } from "@/env";
import { getOrgContext } from "@/server/session";
import { appendMessage, getOrCreateChatSession } from "@/server/ai/chat-store";
import { siteBelongsToOrg } from "@/server/ai/context";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  siteId: z.string().uuid(),
  integrationId: z.string().uuid(),
  kind: z.enum(["access_token", "api_secret", "oauth_refresh_token", "oauth_access_token", "webhook_secret", "signing_secret"]),
  value: z.string().min(8).max(4_096),
  label: z.string().max(80).optional(),
});

/**
 * Secure credential card: the secret goes straight into the vault, is validated against the vendor
 * and never touches the chat transcript or the model. Only a reference is returned.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (!["OWNER", "ADMIN", "DEVELOPER"].includes(ctx.role)) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR" }, { status: 400 });
  const v = vault();
  if (!v) return NextResponse.json({ ok: false, code: "NOT_CONNECTED", message: "Credential storage is not configured (MASTER_KEY)." }, { status: 424 });
  if (!(await siteBelongsToOrg(ctx.organization.id, parsed.data.siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const integration = await withTenant(db(), ctx.organization.id, (tx) => getIntegration(tx, parsed.data.siteId, parsed.data.integrationId));
  if (!integration) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const connector = getConnector(integration.connectorType);
  const requirement = connector?.meta.requiredCredentials.find((c) => c.kind === parsed.data.kind);
  if (!requirement) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "This connector does not accept that credential kind." }, { status: 400 });
  void containsSecret;

  const ref = await withTenant(db(), ctx.organization.id, (tx) => storeCredential(tx, v, { organizationId: ctx.organization.id, integrationId: integration.id, kind: parsed.data.kind, label: parsed.data.label ?? requirement.label, plaintext: parsed.data.value, actor: ctx.tenant.actor, userId: ctx.user.id }));

  // validate with the vendor (cheapest read call) and set status honestly
  const e = env();
  const validation = connector
    ? await connector.validateCredentials({
        organizationId: ctx.organization.id,
        siteId: integration.siteId,
        integrationId: integration.id,
        publicConfig: integration.publicConfig,
        settings: integration.settings,
        testMode: integration.testMode,
        getCredential: async (kind) => (kind === parsed.data.kind ? parsed.data.value : null),
        fetch,
        baseUrlOverride: e.VENDOR_MOCK_BASE_URL,
        allowPrivateNetwork: e.VENDOR_ALLOW_PRIVATE,
        logger: silentLogger(),
        now: () => new Date(),
      })
    : null;
  const status = validation?.ok ? "connected" : validation?.status === "not_connected" ? "not_connected" : "error";
  await withTenant(db(), ctx.organization.id, (tx) => setIntegrationStatus(tx, { siteId: integration.siteId, integrationId: integration.id, status, health: validation ? { status: validation.ok ? "healthy" : "unhealthy", checkedAt: validation.checkedAt, detail: validation.detail, apiVersion: validation.apiVersion } : undefined, actor: ctx.tenant.actor }));
  const session = await getOrCreateChatSession(ctx.organization.id, parsed.data.siteId, ctx.user.id, ctx.user.locale);
  await appendMessage(ctx.organization.id, session.id, { role: "system", content: `credential ${parsed.data.kind} stored for integration ${integration.name} (${ref.masked}); validation: ${validation?.status ?? "n/a"}` });
  const refs = await withTenant(db(), ctx.organization.id, (tx) => listCredentialRefs(tx, integration.id));
  return NextResponse.json({ ok: true, credential: { id: ref.id, kind: ref.kind, last4: ref.last4, masked: ref.masked }, validation, status, credentials: refs.map((r) => ({ id: r.id, kind: r.kind, status: r.status, last4: r.last4 })) });
}
