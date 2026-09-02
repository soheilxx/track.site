import { CircuitBreaker, backoffDelay, newUlid, sha256Hex, silentLogger } from "@track-site/core";
import type { DeliveryMessage } from "@track-site/events";
import { clickIdsForDestination, evaluateDispatch, type ConnectorType } from "@track-site/policy";
import { getConnector, isRetryable, type ConnectorContext, type DispatchResult } from "@track-site/connectors";
import type { QueueMessage } from "@track-site/queue";
import type { WorkerContext } from "../context.ts";

const breakers = new Map<string, CircuitBreaker>();
function breakerFor(integrationId: string): CircuitBreaker {
  let b = breakers.get(integrationId);
  if (!b) {
    b = new CircuitBreaker({ failureThreshold: 5, windowMs: 60_000, cooldownMs: 30_000 });
    breakers.set(integrationId, b);
  }
  return b;
}

export type DeliveryOutcome = "delivered" | "retry" | "failed" | "dead" | "skipped";

/**
 * Delivery stage for one (event, integration) pair. Re-checks the policy engine immediately before
 * dispatch, records every attempt, retries with backoff + Retry-After, opens a circuit breaker per
 * destination and dead-letters after the configured attempts. Auth errors pause the integration.
 */
export async function processDeliveryMessage(ctx: WorkerContext, message: QueueMessage<DeliveryMessage>): Promise<DeliveryOutcome> {
  const msg = message.body;
  const runtime = await ctx.configs.get(msg.site_id, await environmentOf(ctx, msg.site_id));
  const integration = runtime.integrations.get(msg.integration_id);
  const dest = runtime.bundle?.destinations.find((d) => d.id === msg.integration_id);
  const connector = getConnector(msg.connector_type as ConnectorType);
  if (!integration || !dest || !connector) {
    await recordAttempt(ctx, msg, message.attempts, { status: "skipped", errorClass: "permanent", errorCode: "destination_missing", message: "integration or config no longer exists", httpStatus: null, durationMs: 0, preview: null, responseExcerpt: null, vendorEventId: null });
    await ctx.queue.ack(message);
    return "skipped";
  }
  const event = await ctx.eventStore.getById(msg.site_id, msg.event_id);
  if (!event) {
    await ctx.queue.ack(message);
    return "skipped";
  }
  const decision = evaluateDispatch(event, { connectorType: dest.type as ConnectorType, status: integration.status, requiredPurpose: dest.purpose }, runtime.policy);
  if (!decision.allow) {
    await recordAttempt(ctx, msg, message.attempts, { status: "skipped", errorClass: "policy_blocked", errorCode: decision.reason, message: null, httpStatus: null, durationMs: 0, preview: null, responseExcerpt: null, vendorEventId: null });
    await ctx.eventStore.markDelivery(msg.site_id, msg.event_id, { integrationId: msg.integration_id, status: "skipped", attempts: message.attempts, at: ctx.now().toISOString() });
    await ctx.queue.ack(message);
    return "skipped";
  }
  const breaker = breakerFor(msg.integration_id);
  if (!breaker.allow()) {
    await ctx.queue.nack(message, { delayMs: 30_000, error: "circuit_open" });
    return "retry";
  }
  const mapping = dest.mappings.find((m) => m.enabled && m.event === event.name);
  if (!mapping) {
    await ctx.queue.ack(message);
    return "skipped";
  }
  const connectorCtx: ConnectorContext = {
    organizationId: msg.organization_id,
    siteId: msg.site_id,
    integrationId: msg.integration_id,
    publicConfig: integration.publicConfig,
    settings: integration.settings,
    testMode: integration.testMode || runtime.testMode,
    getCredential: async (kind) => {
      if (!ctx.vault) return null;
      const res = await ctx.pool.query<{ ciphertext: string }>(
        `SELECT ciphertext FROM credentials WHERE integration_id = $1 AND kind = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [msg.integration_id, kind],
      );
      const row = res.rows[0];
      if (!row) return null;
      return ctx.vault.decrypt(row.ciphertext, `integration:${msg.integration_id}`);
    },
    fetch: ctx.fetch,
    baseUrlOverride: ctx.env.VENDOR_MOCK_BASE_URL ?? null,
    allowPrivateNetwork: ctx.env.VENDOR_ALLOW_PRIVATE,
    logger: ctx.logger ?? silentLogger(),
    now: ctx.now,
  };
  const clickIds = clickIdsForDestination(event, dest.type as ConnectorType, ctx.now());
  const payload = connector.mapEvent({ event, clickIds, dedupId: event.source_event_id }, { event: mapping.event, vendorEvent: mapping.vendor_event, enabled: mapping.enabled, fieldMap: (mapping.field_map as Record<string, unknown> | null) ?? null }, connectorCtx);
  if (!payload) {
    await ctx.queue.ack(message);
    return "skipped";
  }
  const validation = connector.validatePayload(payload);
  if (!validation.ok) {
    await recordAttempt(ctx, msg, message.attempts, { status: "failed", errorClass: "invalid_payload", errorCode: "validation", message: validation.errors.join("; ").slice(0, 500), httpStatus: null, durationMs: 0, preview: payload.preview, responseExcerpt: null, vendorEventId: null });
    await ctx.eventStore.markDelivery(msg.site_id, msg.event_id, { integrationId: msg.integration_id, status: "failed", attempts: message.attempts, at: ctx.now().toISOString() });
    await ctx.queue.ack(message);
    return "failed";
  }
  const [result] = await connector.dispatchBatch(connectorCtx, [payload]);
  const r: DispatchResult = result!;
  const status: "success" | "retry" | "failed" = r.ok ? "success" : isRetryable(r.errorClass) && message.attempts < ctx.env.MAX_DELIVERY_ATTEMPTS ? "retry" : "failed";
  await recordAttempt(ctx, msg, message.attempts, {
    status,
    errorClass: r.errorClass,
    errorCode: r.errorCode,
    message: r.message,
    httpStatus: r.httpStatus,
    durationMs: r.durationMs,
    preview: payload.preview,
    responseExcerpt: r.responseExcerpt,
    vendorEventId: r.vendorEventId,
    nextRetryAt: status === "retry" ? new Date(ctx.now().getTime() + retryDelay(message.attempts, r)) : null,
  });
  if (r.ok) {
    breaker.recordSuccess();
    await ctx.eventStore.markDelivery(msg.site_id, msg.event_id, { integrationId: msg.integration_id, status: "delivered", attempts: message.attempts, at: ctx.now().toISOString() });
    await bumpAggregate(ctx, msg, event.name, event.source, "delivered");
    await ctx.queue.ack(message);
    return "delivered";
  }
  breaker.recordFailure();
  if (r.errorClass === "auth" || r.errorClass === "credential_expired") {
    await ctx.pool.query(`UPDATE integrations SET status = 'error', health = jsonb_build_object('status','unhealthy','checkedAt',$2::text,'detail',$3::text,'apiVersion',$4::text) WHERE id = $1 AND status = 'connected'`, [
      msg.integration_id,
      ctx.now().toISOString(),
      r.errorClass === "auth" ? "Vendor rejected the credentials" : "Credential missing or expired",
      connector.meta.apiVersion,
    ]);
    ctx.configs.invalidate(msg.site_id);
  }
  if (status === "retry") {
    await ctx.queue.nack(message, { delayMs: retryDelay(message.attempts, r), error: r.errorCode ?? r.errorClass });
    return "retry";
  }
  await ctx.eventStore.markDelivery(msg.site_id, msg.event_id, { integrationId: msg.integration_id, status: "failed", attempts: message.attempts, at: ctx.now().toISOString() });
  await bumpAggregate(ctx, msg, event.name, event.source, "failed");
  if (isRetryable(r.errorClass)) {
    await ctx.queue.deadLetter(message, `${r.errorClass}: ${r.errorCode ?? ""} after ${message.attempts} attempts`);
    await ctx.pool.query(
      `INSERT INTO dead_letter_references (id, organization_id, site_id, queue, event_id, integration_id, reason) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [message.id, msg.organization_id, msg.site_id, message.queue, msg.event_id, msg.integration_id, `${r.errorClass}:${r.errorCode ?? ""}`.slice(0, 200)],
    );
    return "dead";
  }
  await ctx.queue.ack(message);
  return "failed";
}

function retryDelay(attempt: number, r: DispatchResult): number {
  if (r.retryAfterMs !== null) return Math.min(r.retryAfterMs, 60 * 60_000);
  return backoffDelay(attempt, { baseMs: 2_000, maxMs: 15 * 60_000 });
}

const envCache = new Map<string, string>();
async function environmentOf(ctx: WorkerContext, siteId: string): Promise<string> {
  const cached = envCache.get(siteId);
  if (cached) return cached;
  const res = await ctx.pool.query<{ id: string }>(`SELECT id FROM environments WHERE site_id = $1 AND is_default LIMIT 1`, [siteId]);
  const id = res.rows[0]?.id ?? siteId;
  envCache.set(siteId, id);
  return id;
}

interface AttemptRecord {
  status: "pending" | "success" | "retry" | "failed" | "dead" | "skipped";
  errorClass: string;
  errorCode: string | null;
  message: string | null;
  httpStatus: number | null;
  durationMs: number;
  preview: Record<string, unknown> | null;
  responseExcerpt: string | null;
  vendorEventId: string | null;
  nextRetryAt?: Date | null;
}

async function recordAttempt(ctx: WorkerContext, msg: DeliveryMessage, attempt: number, a: AttemptRecord): Promise<void> {
  const errorClass = ["none", "temporary", "permanent", "rate_limited", "auth", "credential_expired", "invalid_payload", "policy_blocked", "timeout"].includes(a.errorClass) ? a.errorClass : "permanent";
  await ctx.pool.query(
    `INSERT INTO delivery_attempts (id, organization_id, site_id, event_id, event_name, integration_id, connector_type, attempt, status, error_class, error_code, error_message, http_status, request_digest, payload_preview, response_excerpt, duration_ms, next_retry_at, finished_at)
     VALUES ($1,$2,$3,$4,(SELECT coalesce((SELECT name FROM events WHERE site_id = $3 AND event_id = $4 LIMIT 1), 'unknown')),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17, now())
     ON CONFLICT (event_id, integration_id, attempt) DO UPDATE SET status = EXCLUDED.status, error_class = EXCLUDED.error_class, error_code = EXCLUDED.error_code, error_message = EXCLUDED.error_message, http_status = EXCLUDED.http_status, finished_at = now()`,
    [
      newUlid(),
      msg.organization_id,
      msg.site_id,
      msg.event_id,
      msg.integration_id,
      msg.connector_type,
      attempt,
      a.status,
      errorClass,
      a.errorCode,
      a.message?.slice(0, 500) ?? null,
      a.httpStatus,
      a.preview ? sha256Hex(JSON.stringify(a.preview)) : null,
      a.preview ? JSON.stringify(a.preview) : null,
      a.responseExcerpt,
      a.durationMs,
      a.nextRetryAt ?? null,
    ],
  );
}

async function bumpAggregate(ctx: WorkerContext, msg: DeliveryMessage, eventName: string, source: string, kind: "delivered" | "failed"): Promise<void> {
  const bucket = ctx.now();
  bucket.setUTCMinutes(0, 0, 0);
  const env = await environmentOf(ctx, msg.site_id);
  const src = source === "browser" ? "browser" : "server";
  await ctx.pool
    .query(
      `INSERT INTO event_aggregates (organization_id, site_id, environment_id, bucket_start, event_name, source, ${kind})
       VALUES ($1,$2,$3,$4,$5,$6,1)
       ON CONFLICT (site_id, environment_id, bucket_start, event_name, source) DO UPDATE SET ${kind} = event_aggregates.${kind} + 1`,
      [msg.organization_id, msg.site_id, env, bucket, eventName, src],
    )
    .catch((e) => ctx.logger.warn({ err: e instanceof Error ? e.message : String(e) }, "aggregate bump failed"));
}
