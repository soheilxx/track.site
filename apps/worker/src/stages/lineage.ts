import type { Pool } from "pg";
import { newUlid, type AppLogger } from "@track-site/core";
import type { LineageOutcome, LineageStage } from "@track-site/db/schema";

/**
 * Event lineage writer (migration 0007 `event_lineage`; Live Event Explorer and Test Lab timeline).
 * The stages collect rows while they process a message and flush them in one batched insert as the
 * data-plane role. Lineage is observability, never a dependency of the pipeline: a failed write is
 * logged and dropped, a missing table (migration not applied yet) silences the writer for a minute.
 * Rows carry no identifiers and no payload fields — only names, stages, reasons and redacted detail.
 */
export interface LineageRecord {
  organizationId: string;
  siteId: string;
  environmentId: string | null;
  eventId: string;
  sourceEventId: string | null;
  /** collector message id of the batch the event arrived in */
  batchId: string | null;
  eventName: string;
  source: string;
  stage: LineageStage;
  outcome: LineageOutcome;
  reason?: string | null;
  integrationId?: string | null;
  detail?: Record<string, unknown>;
  occurredAt: Date;
}

export interface LineageContext {
  pool: Pool;
  logger: AppLogger;
}

const COLUMNS = ["id", "organization_id", "site_id", "environment_id", "event_id", "source_event_id", "batch_id", "event_name", "source", "stage", "outcome", "reason", "integration_id", "detail", "occurred_at"] as const;
const CHUNK = 200;
const RETRY_AFTER_MISSING_MS = 60_000;

let unavailableUntil = 0;

/** Test hook: forget a "table missing" back-off. */
export function resetLineageAvailability(): void {
  unavailableUntil = 0;
}

function rowValues(r: LineageRecord): unknown[] {
  return [newUlid(), r.organizationId, r.siteId, r.environmentId, r.eventId, r.sourceEventId, r.batchId, r.eventName.slice(0, 64), r.source, r.stage, r.outcome, r.reason?.slice(0, 128) ?? null, r.integrationId ?? null, JSON.stringify(r.detail ?? {}), r.occurredAt];
}

/** Inserts the collected rows (best effort, never throws). */
export async function writeLineage(ctx: LineageContext, rows: LineageRecord[]): Promise<void> {
  if (rows.length === 0 || Date.now() < unavailableUntil) return;
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = chunk.map((r, n) => {
        values.push(...rowValues(r));
        const base = n * COLUMNS.length;
        return `(${COLUMNS.map((c, j) => (c === "detail" ? `$${base + j + 1}::jsonb` : `$${base + j + 1}`)).join(",")})`;
      });
      await client.query(`INSERT INTO event_lineage (${COLUMNS.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`, values);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    const code = (e as { code?: unknown }).code;
    if (code === "42P01") {
      unavailableUntil = Date.now() + RETRY_AFTER_MISSING_MS;
      ctx.logger.warn("event_lineage missing: apply migration 0007_event_lineage (lineage disabled for 60 s)");
    } else {
      ctx.logger.warn({ err: e instanceof Error ? e.message : String(e), rows: rows.length }, "lineage write failed");
    }
  } finally {
    client.release();
  }
}
