import { createHash, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { newUlid } from "@track-site/core";
import type { IncomingServerEvent, IngestMessage } from "@track-site/events";
import { QUEUES, partitionKeyFor } from "@track-site/queue";
import type { CollectorDeps } from "./app.ts";

/**
 * Inbound affiliate postbacks: networks / marketplaces that push conversions to the advertiser.
 * `POST|GET /v1/affiliate/in/:trackingId/:preset` — the site is resolved by tracking id, the affiliate
 * destination with the matching preset must exist, and every request is authenticated per preset:
 *   - digistore24: IPN `sha_sign` = uppercase SHA-512 over sorted `key=value<passphrase>` pairs (empty values skipped),
 *     passphrase stored as the destination's `signing_secret`; `connection_test` answers "OK".
 *   - any other preset: shared token (`webhook_secret` credential) in the `token` query parameter or `x-tracksite-token` header.
 * Accepted notifications become server events (`source: webhook`, verified) and flow through the normal pipeline.
 */
export function digistoreSignature(params: Record<string, string>, passphrase: string): string {
  const keys = Object.keys(params)
    .filter((k) => k !== "sha_sign" && k !== "SHASIGN")
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let str = "";
  for (const k of keys) {
    const v = params[k];
    if (v === undefined || v === null || v === "" || v === "false") continue;
    str += `${k}=${v}${passphrase}`;
  }
  return createHash("sha512").update(str).digest("hex").toUpperCase();
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const DIGISTORE_EVENTS: Record<string, string> = { on_payment: "purchase", on_refund: "refund", on_chargeback: "refund" };

export function registerAffiliateInbound(app: Hono, deps: CollectorDeps, now: () => Date): void {
  app.all("/v1/affiliate/in/:trackingId/:preset", async (c) => {
    if (deps.env.KILL_SWITCH_GLOBAL) return c.text("paused", 503);
    const preset = c.req.param("preset");
    const site = await deps.sites.byTrackingId(c.req.param("trackingId"));
    if (!site || site.status !== "active") return c.text("unknown site", 404);
    if (!deps.pool) return c.text("not configured", 503);
    const integrations = await deps.pool.query<{ id: string; public_config: Record<string, unknown>; status: string }>(`SELECT id, public_config, status FROM integrations WHERE site_id = $1 AND connector_type = 'affiliate'`, [site.siteId]);
    const integration = integrations.rows.find((r) => r.public_config?.preset === preset);
    if (!integration) return c.text("no destination for preset", 404);

    const ct = c.req.header("content-type") ?? "";
    let params: Record<string, string> = {};
    if (c.req.method === "GET") params = c.req.query();
    else if (ct.includes("application/json")) {
      const json = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      for (const [k, v] of Object.entries(json ?? {})) params[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
    } else params = Object.fromEntries(new URLSearchParams(await c.req.text()));
    for (const [k, v] of Object.entries(c.req.query())) if (!(k in params)) params[k] = v;

    const secretFor = async (kind: string): Promise<string | null> => {
      if (!deps.vault) return null;
      const res = await deps.pool!.query<{ ciphertext: string }>(`SELECT ciphertext FROM credentials WHERE integration_id = $1 AND kind = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1`, [integration.id, kind]);
      const row = res.rows[0];
      return row ? deps.vault.decrypt(row.ciphertext, `integration:${integration.id}`) : null;
    };

    let event: IncomingServerEvent;
    if (preset === "digistore24") {
      const passphrase = await secretFor("signing_secret");
      if (!passphrase) return c.text("passphrase not configured", 503);
      const sig = params.sha_sign ?? params.SHASIGN ?? "";
      if (!sig || !safeEqual(sig.toUpperCase(), digistoreSignature(params, passphrase))) return c.text("invalid signature", 401);
      if (params.event === "connection_test") return c.text("OK", 200);
      const name = DIGISTORE_EVENTS[params.event ?? ""];
      if (!name) return c.text("OK", 200); // other lifecycle events are acknowledged, not tracked
      const value = Number(params.transaction_amount ?? params.amount_brutto ?? params.amount ?? "0");
      const clickId = params.custom || params.campaignkey || params.cid || null;
      event = {
        name,
        ts: now().getTime(),
        props: { offline: true, affiliate_network: "digistore24", api_mode: params.api_mode ?? null, billing_type: params.billing_type ?? null, pay_method: params.pay_method ?? null, affiliate_name: params.affiliate_name ?? null },
        commerce: { order_id: params.order_id ?? params.transaction_id ?? null, transaction_id: params.transaction_id ?? null, currency: (params.transaction_currency ?? params.currency ?? "EUR").toUpperCase(), value: name === "refund" ? -Math.abs(value) : value, items: params.product_id ? [{ item_id: String(params.product_id), item_name: params.product_name ?? null, price: value, quantity: Number(params.quantity ?? "1") || 1 }] : [] },
        ...(params.email ? { user_data: { email: params.email, first_name: params.first_name ?? null, last_name: params.last_name ?? null } } : {}),
        ...(clickId ? { click_ids: { aff_click_id: clickId } } : {}),
        consent: { granted: ["necessary", "marketing"], source: "server", policy_version: "network", ts: now().getTime(), region: null, gpc: false },
        source: "webhook",
        source_verified: true,
      };
    } else {
      const token = await secretFor("webhook_secret");
      const provided = c.req.header("x-tracksite-token") ?? params.token ?? "";
      if (!token || !provided || !safeEqual(provided, token)) return c.text("unauthorized", 401);
      const name = params.event === "refund" ? "refund" : params.event === "lead" ? "generate_lead" : "purchase";
      const value = Number(params.amount ?? params.value ?? "0");
      event = {
        name,
        ts: now().getTime(),
        props: { offline: true, affiliate_network: preset },
        commerce: { order_id: params.order_id ?? params.order ?? null, currency: (params.currency ?? "EUR").toUpperCase(), value: Number.isFinite(value) ? value : 0, items: [] },
        ...(params.email ? { user_data: { email: params.email } } : {}),
        ...(params.click_id ? { click_ids: { aff_click_id: params.click_id } } : {}),
        consent: { granted: ["necessary", "marketing"], source: "server", policy_version: "network", ts: now().getTime(), region: null, gpc: false },
        source: "webhook",
        source_verified: true,
      };
    }

    const env = site.environments.find((e) => e.isDefault) ?? site.environments[0];
    if (!env) return c.text("no environment", 503);
    const message: IngestMessage = {
      kind: "server_batch",
      message_id: newUlid(),
      received_at: now().toISOString(),
      site: { organization_id: site.organizationId, site_id: site.siteId, tracking_id: site.trackingId, environment_id: env.id, partition_key: partitionKeyFor(site.organizationId, site.siteId, site.partitionOverride) },
      source_key_id: null,
      ip_truncated: null,
      ua_family: "affiliate-postback",
      events: [event],
    };
    try {
      await deps.queue.enqueue(QUEUES.ingest, [{ id: message.message_id, body: message, partitionKey: message.site.partition_key }]);
    } catch {
      c.header("retry-after", "5");
      return c.text("queue unavailable", 503);
    }
    return c.text("OK", 200);
  });
}
