import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalKeyProvider, SecretVault, generateSigningKeyPair, verifyBundle } from "@track-site/core";
import { withTenant } from "../client.ts";
import { organization } from "../schema/auth.ts";
import { auditLog } from "../schema/platform.ts";
import { testDb } from "../testing.ts";
import { activeVersion, getOrCreateDraft, listVersions, preparePublish, publishDraft, rollbackToVersion, updateDraft } from "./config.ts";
import { createIntegrationDraft, generateWebhookSecret, listCredentialRefs, savePublicConfig, storeCredential } from "./integrations.ts";
import { createSite, defaultEnvironment } from "./sites.ts";

const t = testDb();
const keys = generateSigningKeyPair("cfg-test");
const actor = { kind: "system" as const, name: "test" };
let orgId = "";
let siteId = "";
let envId = "";

beforeAll(async () => {
  const [org] = await t.db.insert(organization).values({ name: "Cfg", slug: `cfg-${Date.now()}` }).returning();
  orgId = org!.id;
  await withTenant(t.db, orgId, async (tx) => {
    const site = await createSite(tx, { organizationId: orgId, name: "Cfg site", primaryDomain: "www.cfg.test", createdBy: null });
    siteId = site.id;
    envId = (await defaultEnvironment(tx, siteId))!.id;
  });
});

afterAll(async () => {
  await t.close();
});

describe("config lifecycle", () => {
  it("draft -> lint -> publish (signed) -> rollback with audit + outbox", async () => {
    const draft = await withTenant(t.db, orgId, (tx) => getOrCreateDraft(tx, { organizationId: orgId, siteId, environmentId: envId, createdBy: null }));
    expect(draft.baseVersion).toBeNull();
    const again = await withTenant(t.db, orgId, (tx) => getOrCreateDraft(tx, { organizationId: orgId, siteId, environmentId: envId, createdBy: null }));
    expect(again.id).toBe(draft.id);

    const { lint } = await withTenant(t.db, orgId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        b.settings.debug = true;
        b.events.push({ name: "purchase", enabled: true, critical: true, trigger: { type: "api" }, props_map: null, authoritative_source: "none" });
      }),
    );
    expect(lint.ok).toBe(true);
    expect(lint.warnings.map((w) => w.code)).toContain("conversion_browser_only");

    const preview = await withTenant(t.db, orgId, (tx) => preparePublish(tx, draft.id));
    expect(preview.nextVersion).toBe(1);
    expect(preview.diff.length).toBeGreaterThan(0);
    expect(preview.impact.events).toContain("purchase");

    const v1 = await withTenant(t.db, orgId, (tx) => publishDraft(tx, { draftId: draft.id, actor, userId: null, approvalId: null, keys }));
    expect(v1.version).toBe(1);
    expect(verifyBundle({ payload: v1.bundle, digest: v1.digest, keyId: v1.keyId, algorithm: "ed25519", signature: v1.signature }, { "cfg-test": keys.publicKeyBase64 })).toBe(true);
    expect((await withTenant(t.db, orgId, (tx) => activeVersion(tx, envId)))?.id).toBe(v1.id);

    // versions are immutable
    await expect(t.pool.query(`UPDATE config_versions SET summary = 'x' WHERE id = $1`, [v1.id])).rejects.toMatchObject({ code: "42501" });

    const draft2 = await withTenant(t.db, orgId, (tx) => getOrCreateDraft(tx, { organizationId: orgId, siteId, environmentId: envId, createdBy: null }));
    expect(draft2.baseVersion).toBe(1);
    await withTenant(t.db, orgId, (tx) => updateDraft(tx, draft2.id, (b) => void (b.settings.debug = false)));
    const preview2 = await withTenant(t.db, orgId, (tx) => preparePublish(tx, draft2.id));
    expect(preview2.diff.map((d) => d.summary)).toContain("Setting debug: true → false");
    const v2 = await withTenant(t.db, orgId, (tx) => publishDraft(tx, { draftId: draft2.id, actor, userId: null, approvalId: null, keys }));
    expect(v2.version).toBe(2);

    const back = await withTenant(t.db, orgId, (tx) => rollbackToVersion(tx, { environmentId: envId, targetVersionId: v1.id, actor, userId: null, approvalId: null }));
    expect(back.id).toBe(v1.id);
    expect((await withTenant(t.db, orgId, (tx) => activeVersion(tx, envId)))?.version).toBe(1);
    expect((await withTenant(t.db, orgId, (tx) => listVersions(tx, envId))).map((v) => v.version)).toEqual([2, 1]);

    const audits = await withTenant(t.db, orgId, (tx) => tx.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.organizationId, orgId)));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["config.publish", "config.rollback"]));
    const events = await t.pool.query(`SELECT topic FROM outbox WHERE organization_id = $1 ORDER BY created_at`, [orgId]);
    expect(events.rows.map((r) => r.topic)).toEqual(expect.arrayContaining(["config.published", "config.rolled_back"]));
  });

  it("blocks publishing drafts with lint errors", async () => {
    const draft = await withTenant(t.db, orgId, (tx) => getOrCreateDraft(tx, { organizationId: orgId, siteId, environmentId: envId, createdBy: null }));
    const { lint } = await withTenant(t.db, orgId, (tx) => updateDraft(tx, draft.id, (b) => void (b.settings.allowed_hosts = [])));
    expect(lint.ok).toBe(false);
    await expect(withTenant(t.db, orgId, (tx) => publishDraft(tx, { draftId: draft.id, actor, userId: null, approvalId: null, keys }))).rejects.toThrow(/lint/);
  });
});

describe("integrations + credentials", () => {
  it("stores secrets only through the vault and exposes references", async () => {
    const vault = new SecretVault(new LocalKeyProvider(Buffer.alloc(32, 1).toString("base64"), "k1"));
    const integ = await withTenant(t.db, orgId, (tx) => createIntegrationDraft(tx, { organizationId: orgId, siteId, connectorType: "webhook", name: "Hook", actor }));
    await withTenant(t.db, orgId, (tx) => savePublicConfig(tx, { siteId, integrationId: integ.id, publicConfig: { url: "https://hooks.example.com/x" }, actor }));
    await expect(withTenant(t.db, orgId, (tx) => savePublicConfig(tx, { siteId, integrationId: integ.id, publicConfig: { access_token: "EAABsbCS1iHgBAOZCZBZCZBZCZBZC" }, actor }))).rejects.toThrow(/secret/);
    const { secret, credentialId } = await withTenant(t.db, orgId, (tx) => generateWebhookSecret(tx, vault, { organizationId: orgId, integrationId: integ.id, actor, userId: null }));
    expect(secret.startsWith("whs_")).toBe(true);
    const refs = await withTenant(t.db, orgId, (tx) => listCredentialRefs(tx, integ.id));
    expect(refs[0]).toMatchObject({ id: credentialId, kind: "signing_secret", status: "active", last4: secret.slice(-4) });
    const raw = await t.pool.query(`SELECT ciphertext FROM credentials WHERE id = $1`, [credentialId]);
    expect(raw.rows[0].ciphertext).not.toContain(secret);
    expect(await vault.decrypt(raw.rows[0].ciphertext, `integration:${integ.id}`)).toBe(secret);
    const rotated = await withTenant(t.db, orgId, (tx) => storeCredential(tx, vault, { organizationId: orgId, integrationId: integ.id, kind: "signing_secret", label: "rotated", plaintext: "whs_new_secret_value_123456", actor, userId: null }));
    expect(rotated.masked).toBe("••••3456");
    const after = await withTenant(t.db, orgId, (tx) => listCredentialRefs(tx, integ.id));
    expect(after.map((r) => r.status)).toEqual(["active", "rotated"]);
  });
});
