import { newUlid, redactDeep, type Actor } from "@track-site/core";
import type { DbOrTx } from "../client.ts";
import { auditLog } from "../schema/platform.ts";

export interface AuditEntry {
  organizationId: string | null;
  actor: Actor;
  action: string;
  targetType: string;
  targetId?: string | null;
  diff?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
  requestId?: string | null;
}

/** Append-only audit entry; payloads are redacted before they are stored. */
export async function recordAudit(tx: DbOrTx, entry: AuditEntry): Promise<string> {
  const id = newUlid();
  const actor = redactDeep({ ...entry.actor }) as unknown as Record<string, unknown>;
  await tx.insert(auditLog).values({
    id,
    organizationId: entry.organizationId,
    actor,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    diff: entry.diff ? redactDeep(entry.diff) : null,
    metadata: redactDeep(entry.metadata ?? {}),
    ipHash: entry.ipHash ?? null,
    requestId: entry.requestId ?? null,
  });
  return id;
}
