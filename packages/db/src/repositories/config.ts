import { and, desc, eq } from "drizzle-orm";
import { newUlid, type Actor } from "@track-site/core";
import {
  configBundleSchema,
  defaultBundle,
  diffBundles,
  lintBundle,
  publishImpact,
  signConfigBundle,
  type ConfigBundle,
  type DiffEntry,
  type LintResult,
} from "@track-site/config";
import type { DbOrTx } from "../client.ts";
import { configDrafts, configPublications, configVersions } from "../schema/config.ts";
import { outbox } from "../schema/delivery.ts";
import { environments, sites } from "../schema/tenancy.ts";
import { recordAudit } from "./audit.ts";

/**
 * Draft -> validate/lint -> preview (diff) -> publish (signed, immutable) -> rollback.
 * All functions run inside `withTenant` and write audit entries + outbox events.
 */
export interface SigningKeys {
  keyId: string;
  privateKeyBase64: string;
}

export type DraftRow = typeof configDrafts.$inferSelect;
export type VersionRow = typeof configVersions.$inferSelect;

export async function activeVersion(tx: DbOrTx, environmentId: string): Promise<VersionRow | null> {
  const rows = await tx
    .select({ v: configVersions })
    .from(configPublications)
    .innerJoin(configVersions, eq(configVersions.id, configPublications.versionId))
    .where(
      and(
        eq(configPublications.environmentId, environmentId),
        eq(configPublications.isActive, true),
      ),
    )
    .orderBy(desc(configPublications.publishedAt))
    .limit(1);
  return rows[0]?.v ?? null;
}

export async function listVersions(
  tx: DbOrTx,
  environmentId: string,
  limit = 50,
): Promise<VersionRow[]> {
  return tx
    .select()
    .from(configVersions)
    .where(eq(configVersions.environmentId, environmentId))
    .orderBy(desc(configVersions.version))
    .limit(limit);
}

export async function openDraft(tx: DbOrTx, environmentId: string): Promise<DraftRow | null> {
  const rows = await tx
    .select()
    .from(configDrafts)
    .where(and(eq(configDrafts.environmentId, environmentId), eq(configDrafts.status, "open")))
    .orderBy(desc(configDrafts.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns the open draft or creates one from the active version (or the default bundle). */
export async function getOrCreateDraft(
  tx: DbOrTx,
  input: {
    organizationId: string;
    siteId: string;
    environmentId: string;
    createdBy: string | null;
  },
): Promise<DraftRow> {
  const existing = await openDraft(tx, input.environmentId);
  if (existing) return existing;
  const [site] = await tx.select().from(sites).where(eq(sites.id, input.siteId)).limit(1);
  const [env] = await tx
    .select()
    .from(environments)
    .where(eq(environments.id, input.environmentId))
    .limit(1);
  if (!site || !env) throw new Error("site or environment not found");
  const active = await activeVersion(tx, input.environmentId);
  const base: ConfigBundle = active
    ? configBundleSchema.parse(active.bundle)
    : defaultBundle(site.trackingId, env.kind, site.primaryDomain);
  const bundle: ConfigBundle = {
    ...base,
    version: (active?.version ?? 0) + 1,
    created_at: new Date().toISOString(),
  };
  const [draft] = await tx
    .insert(configDrafts)
    .values({
      organizationId: input.organizationId,
      siteId: input.siteId,
      environmentId: input.environmentId,
      baseVersion: active?.version ?? null,
      bundle,
      status: "open",
      createdBy: input.createdBy,
    })
    .returning();
  return draft!;
}

/** Applies a mutation to the draft bundle, re-lints and stores the result. */
export async function updateDraft(
  tx: DbOrTx,
  draftId: string,
  mutate: (bundle: ConfigBundle) => ConfigBundle | void,
): Promise<{ draft: DraftRow; lint: LintResult }> {
  const [draft] = await tx.select().from(configDrafts).where(eq(configDrafts.id, draftId)).limit(1);
  if (!draft || draft.status !== "open") throw new Error("draft not open");
  const current = configBundleSchema.parse(draft.bundle);
  const clone = structuredClone(current);
  const next = mutate(clone) ?? clone;
  const lint = lintBundle(next);
  const [updated] = await tx
    .update(configDrafts)
    .set({
      bundle: next,
      lint: { errors: lint.errors, warnings: lint.warnings, checkedAt: new Date().toISOString() },
      status: lint.ok ? "validated" : "open",
    })
    .where(eq(configDrafts.id, draftId))
    .returning();
  // keep validated drafts editable: "validated" only marks a clean lint result
  if (updated!.status === "validated")
    await tx.update(configDrafts).set({ status: "open" }).where(eq(configDrafts.id, draftId));
  return { draft: { ...updated!, status: "open" }, lint };
}

export interface PublishPreview {
  draft: DraftRow;
  lint: LintResult;
  diff: DiffEntry[];
  impact: ReturnType<typeof publishImpact>;
  baseVersion: number | null;
  nextVersion: number;
}

export async function preparePublish(tx: DbOrTx, draftId: string): Promise<PublishPreview> {
  const [draft] = await tx.select().from(configDrafts).where(eq(configDrafts.id, draftId)).limit(1);
  if (!draft || draft.status === "published" || draft.status === "discarded")
    throw new Error("draft not publishable");
  const bundle = configBundleSchema.parse(draft.bundle);
  const active = await activeVersion(tx, draft.environmentId);
  const before = active ? configBundleSchema.parse(active.bundle) : null;
  const lint = lintBundle(bundle);
  return {
    draft,
    lint,
    diff: diffBundles(before, bundle),
    impact: publishImpact(bundle),
    baseVersion: active?.version ?? null,
    nextVersion: (active?.version ?? 0) + 1,
  };
}

export async function publishDraft(
  tx: DbOrTx,
  input: {
    draftId: string;
    actor: Actor;
    userId: string | null;
    approvalId: string | null;
    keys: SigningKeys;
    requestId?: string;
  },
): Promise<VersionRow> {
  const preview = await preparePublish(tx, input.draftId);
  if (!preview.lint.ok)
    throw new Error(`draft has lint errors: ${preview.lint.errors.map((e) => e.code).join(", ")}`);
  const draft = preview.draft;
  const bundle: ConfigBundle = {
    ...configBundleSchema.parse(draft.bundle),
    version: preview.nextVersion,
    created_at: new Date().toISOString(),
  };
  const signed = signConfigBundle(bundle, input.keys.keyId, input.keys.privateKeyBase64);
  const [version] = await tx
    .insert(configVersions)
    .values({
      organizationId: draft.organizationId,
      siteId: draft.siteId,
      environmentId: draft.environmentId,
      version: preview.nextVersion,
      bundle: signed.payload,
      digest: signed.digest,
      signature: signed.signature,
      keyId: signed.keyId,
      summary:
        preview.diff
          .slice(0, 20)
          .map((d) => d.summary)
          .join("; ") || "Initial configuration",
      diff: preview.diff,
      draftId: draft.id,
      createdBy: input.userId,
    })
    .returning();
  await tx
    .update(configPublications)
    .set({ isActive: false, supersededAt: new Date() })
    .where(
      and(
        eq(configPublications.environmentId, draft.environmentId),
        eq(configPublications.isActive, true),
      ),
    );
  await tx
    .insert(configPublications)
    .values({
      organizationId: draft.organizationId,
      siteId: draft.siteId,
      environmentId: draft.environmentId,
      versionId: version!.id,
      kind: "publish",
      isActive: true,
      approvalId: input.approvalId,
      publishedBy: input.userId,
    });
  await tx.update(configDrafts).set({ status: "published" }).where(eq(configDrafts.id, draft.id));
  await tx
    .insert(outbox)
    .values({
      id: newUlid(),
      organizationId: draft.organizationId,
      topic: "config.published",
      payload: {
        site_id: draft.siteId,
        environment_id: draft.environmentId,
        version: preview.nextVersion,
      },
    });
  await recordAudit(tx, {
    organizationId: draft.organizationId,
    actor: input.actor,
    action: "config.publish",
    targetType: "config_version",
    targetId: version!.id,
    diff: {
      version: preview.nextVersion,
      base: preview.baseVersion,
      changes: preview.diff.slice(0, 50),
      recipients: preview.impact.recipients,
    },
    requestId: input.requestId ?? null,
  });
  return version!;
}

export async function rollbackToVersion(
  tx: DbOrTx,
  input: {
    environmentId: string;
    targetVersionId: string;
    actor: Actor;
    userId: string | null;
    approvalId: string | null;
    requestId?: string;
  },
): Promise<VersionRow> {
  const [target] = await tx
    .select()
    .from(configVersions)
    .where(
      and(
        eq(configVersions.id, input.targetVersionId),
        eq(configVersions.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!target) throw new Error("target version not found");
  const current = await activeVersion(tx, input.environmentId);
  await tx
    .update(configPublications)
    .set({ isActive: false, supersededAt: new Date() })
    .where(
      and(
        eq(configPublications.environmentId, input.environmentId),
        eq(configPublications.isActive, true),
      ),
    );
  await tx.insert(configPublications).values({
    organizationId: target.organizationId,
    siteId: target.siteId,
    environmentId: input.environmentId,
    versionId: target.id,
    kind: "rollback",
    rollbackOfVersionId: current?.id ?? null,
    isActive: true,
    approvalId: input.approvalId,
    publishedBy: input.userId,
  });
  await tx
    .insert(outbox)
    .values({
      id: newUlid(),
      organizationId: target.organizationId,
      topic: "config.rolled_back",
      payload: {
        site_id: target.siteId,
        environment_id: input.environmentId,
        version: target.version,
      },
    });
  await recordAudit(tx, {
    organizationId: target.organizationId,
    actor: input.actor,
    action: "config.rollback",
    targetType: "config_version",
    targetId: target.id,
    diff: { from: current?.version ?? null, to: target.version },
    requestId: input.requestId ?? null,
  });
  return target;
}

/**
 * Publishes a new signed version derived from what is live in the environment (or the default bundle
 * when nothing is live) with `mutate` applied — without touching the open draft, so a change that
 * somebody is still preparing is never shipped by accident. Used by Incident Mode for the per-environment
 * kill switch (`settings.kill_switch`): the same publication mechanics as `publishDraft` (signature,
 * publication flip, outbox `config.published`, audit `config.publish`), only the source bundle differs.
 * Refuses a bundle that fails lint.
 */
export async function publishDerivedVersion(
  tx: DbOrTx,
  input: {
    environmentId: string;
    mutate: (bundle: ConfigBundle) => ConfigBundle | void;
    summary: string;
    actor: Actor;
    userId: string | null;
    keys: SigningKeys;
    requestId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<VersionRow> {
  const [env] = await tx
    .select()
    .from(environments)
    .where(eq(environments.id, input.environmentId))
    .limit(1);
  if (!env) throw new Error("environment not found");
  const [site] = await tx.select().from(sites).where(eq(sites.id, env.siteId)).limit(1);
  if (!site) throw new Error("site not found");
  const active = await activeVersion(tx, env.id);
  const before: ConfigBundle | null = active ? configBundleSchema.parse(active.bundle) : null;
  const base = before ?? defaultBundle(site.trackingId, env.kind, site.primaryDomain);
  const clone = structuredClone(base);
  const mutated = input.mutate(clone) ?? clone;
  const nextVersion = (active?.version ?? 0) + 1;
  const bundle: ConfigBundle = configBundleSchema.parse({
    ...mutated,
    version: nextVersion,
    created_at: new Date().toISOString(),
  });
  const lint = lintBundle(bundle);
  if (!lint.ok)
    throw new Error(`derived bundle has lint errors: ${lint.errors.map((e) => e.code).join(", ")}`);
  const diff = diffBundles(before, bundle);
  const signed = signConfigBundle(bundle, input.keys.keyId, input.keys.privateKeyBase64);
  const [version] = await tx
    .insert(configVersions)
    .values({
      organizationId: env.organizationId,
      siteId: env.siteId,
      environmentId: env.id,
      version: nextVersion,
      bundle: signed.payload,
      digest: signed.digest,
      signature: signed.signature,
      keyId: signed.keyId,
      summary: input.summary,
      diff,
      draftId: null,
      createdBy: input.userId,
    })
    .returning();
  await tx
    .update(configPublications)
    .set({ isActive: false, supersededAt: new Date() })
    .where(
      and(eq(configPublications.environmentId, env.id), eq(configPublications.isActive, true)),
    );
  await tx
    .insert(configPublications)
    .values({
      organizationId: env.organizationId,
      siteId: env.siteId,
      environmentId: env.id,
      versionId: version!.id,
      kind: "publish",
      isActive: true,
      approvalId: null,
      publishedBy: input.userId,
    });
  await tx
    .insert(outbox)
    .values({
      id: newUlid(),
      organizationId: env.organizationId,
      topic: "config.published",
      payload: { site_id: env.siteId, environment_id: env.id, version: nextVersion },
    });
  await recordAudit(tx, {
    organizationId: env.organizationId,
    actor: input.actor,
    action: "config.publish",
    targetType: "config_version",
    targetId: version!.id,
    diff: {
      version: nextVersion,
      base: active?.version ?? null,
      changes: diff.slice(0, 50),
      derived: true,
      summary: input.summary,
    },
    metadata: input.metadata ?? {},
    requestId: input.requestId ?? null,
  });
  return version!;
}

export function compareVersions(a: VersionRow | null, b: VersionRow): DiffEntry[] {
  return diffBundles(
    a ? configBundleSchema.parse(a.bundle) : null,
    configBundleSchema.parse(b.bundle),
  );
}
