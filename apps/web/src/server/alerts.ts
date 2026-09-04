import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { configBundleSchema } from "@track-site/config";
import {
  ALERT_EVENT_HEADER,
  ALERT_FETCH_TIMEOUT_MS,
  ALERT_RULE_KINDS,
  ALERT_SEVERITIES,
  ALERT_SIGNATURE_HEADER,
  ALERT_USER_AGENT,
  activeVersion,
  alertChannels,
  alertEvents,
  alertRules,
  alertSignatureHeader,
  alertSlackPayload,
  alertWebhookBody,
  environments,
  integrations,
  pgErrorCode,
  publishDerivedVersion,
  recordAudit,
  sites,
  type AlertChannelKind,
  type AlertChannelRow,
  type AlertDelivery,
  type AlertEventDetail,
  type AlertNotification,
  type AlertRuleKind,
  type AlertSeverity,
  type AlertThreshold,
  type Tx,
} from "@track-site/db";
import { previewValues } from "@/components/app/alerts/threshold";
import { env } from "@/env";
import { logger, signingKeys, vault } from "@/server/db";
import { sendMail } from "@/server/mail";
import { withOrg, type OrgContext } from "@/server/session";
import type { Workspace } from "@/server/workspace";

/**
 * Alerts & Incident Mode (owner supplement §8 module 13) — data access and pure helpers for
 * `/app/settings/alerts`. Channels, rules and the history live in the tables of migration 0013 and are
 * read under RLS; the worker job `alerts` writes the events. Secrets (webhook URLs, Slack URLs, signing
 * secrets) are envelope encrypted on save and only ever decrypted here for the test notification;
 * the client sees a host hint. Nothing is invented: a database without the migration shows an honest
 * "not available" state, a rule that never ran says so.
 */

export const HISTORY_PAGE_SIZE = 50;
const UUID = /^[0-9a-f-]{36}$/i;

export interface AlertChannelView {
  id: string;
  kind: AlertChannelKind;
  name: string;
  /** e-mail address; null for encrypted targets */
  target: string | null;
  targetHint: string | null;
  locale: string;
  enabled: boolean;
  createdAt: string;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  /** rules referencing the channel */
  usedBy: number;
}

export interface AlertRuleView {
  id: string;
  kind: AlertRuleKind;
  name: string;
  siteId: string | null;
  siteName: string | null;
  threshold: AlertThreshold;
  channelIds: string[];
  channelNames: string[];
  enabled: boolean;
  cooldownMinutes: number;
  lastEvaluatedAt: string | null;
  createdAt: string;
}

export interface AlertDeliveryView {
  channelId: string;
  channelName: string | null;
  kind: AlertChannelKind;
  status: "sent" | "failed" | "skipped";
  transport: string | null;
  error: string | null;
  httpStatus: number | null;
  at: string;
}

export interface AlertEventView {
  id: string;
  kind: AlertRuleKind;
  severity: AlertSeverity;
  ruleName: string | null;
  siteId: string | null;
  siteName: string | null;
  subjectKey: string;
  title: string;
  detail: AlertEventDetail;
  triggeredAt: string;
  resolvedAt: string | null;
  resolvedBy: "auto" | "user" | null;
  notifiedAt: string | null;
  delivery: AlertDeliveryView[];
}

export interface AlertSettings {
  channels: AlertChannelView[];
  rules: AlertRuleView[];
  sites: Array<{ id: string; name: string }>;
  migrationMissing: boolean;
}

export type HistoryState = "open" | "resolved" | "all";

export interface AlertHistoryFilters {
  severity: AlertSeverity | "all";
  state: HistoryState;
  kind: AlertRuleKind | "all";
  page: number;
  /** deep link from a notification: the event to highlight */
  eventId: string | null;
}

export interface AlertHistoryPage {
  entries: AlertEventView[];
  total: number;
  openTotal: number;
  page: number;
  pageCount: number;
  migrationMissing: boolean;
}

export interface IncidentDestination {
  id: string;
  name: string;
  connectorType: string;
  status: string;
  pausedAt: string | null;
  testMode: boolean;
  siteId: string;
  siteName: string;
}

export interface IncidentEnvironment {
  id: string;
  kind: "production" | "staging" | "development";
  name: string;
  testMode: boolean;
  siteId: string;
  siteName: string;
  activeVersion: number | null;
  /** `settings.kill_switch` of the live bundle; null when nothing is published */
  killSwitch: boolean | null;
  publishedAt: string | null;
}

export interface IncidentTargets {
  destinations: IncidentDestination[];
  environments: IncidentEnvironment[];
  /** the web app can sign configuration versions (needed for the environment kill switch) */
  signingAvailable: boolean;
}

// ---------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------------------------------

const toIso = (value: Date | string | null | undefined): string | null =>
  value == null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();

/** URL → filters; anything invalid falls back to the default (never an error page for a bad link). */
export function parseHistoryFilters(
  q: Record<string, string | string[] | undefined>,
): AlertHistoryFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const severity = one(q.severity);
  const state = one(q.state);
  const kind = one(q.kind);
  const page = Number.parseInt(one(q.page), 10);
  const eventId = one(q.event);
  return {
    severity: (ALERT_SEVERITIES as readonly string[]).includes(severity)
      ? (severity as AlertSeverity)
      : "all",
    state: state === "open" || state === "resolved" ? state : "all",
    kind: (ALERT_RULE_KINDS as readonly string[]).includes(kind) ? (kind as AlertRuleKind) : "all",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
    eventId: UUID.test(eventId) ? eventId : null,
  };
}

/** Filters → query string (page links keep every other filter; the deep-linked event is dropped). */
export function historyQueryString(
  filters: AlertHistoryFilters,
  page: number = filters.page,
): string {
  const params = new URLSearchParams();
  if (filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.state !== "all") params.set("state", filters.state);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export type ChannelTargetError =
  | "invalid_email"
  | "invalid_url"
  | "insecure_url"
  | "credentials_in_url"
  | "private_host"
  | "not_slack";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?fc|\[?fd|\[?fe80)/i;

/** Validates a channel target for its kind; returns the error code or null. Never resolves DNS. */
export function validateChannelTarget(
  kind: AlertChannelKind,
  target: string,
): ChannelTargetError | null {
  const value = target.trim();
  if (kind === "email") return EMAIL.test(value) && value.length <= 254 ? null : "invalid_email";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid_url";
  }
  if (url.protocol !== "https:") return "insecure_url";
  if (url.username || url.password) return "credentials_in_url";
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || PRIVATE_HOST.test(host)) return "private_host";
  if (kind === "slack" && host !== "hooks.slack.com") return "not_slack";
  return null;
}

/** What the dashboard may show for an encrypted target: the host only. */
export function channelTargetHint(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Names of the channels a rule references, in the rule's order; unknown ids are skipped. */
export function channelNamesFor(
  channelIds: readonly string[],
  channels: ReadonlyArray<{ id: string; name: string }>,
): string[] {
  const byId = new Map(channels.map((c) => [c.id, c.name]));
  return channelIds.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}

/** Stored delivery map → rows for the history table (channel names looked up, unknown channels kept by id). */
export function deliveryRows(
  delivery: AlertDelivery | null | undefined,
  channelNames: ReadonlyMap<string, string>,
): AlertDeliveryView[] {
  if (!delivery) return [];
  return Object.entries(delivery).map(([channelId, d]) => ({
    channelId,
    channelName: channelNames.get(channelId) ?? null,
    kind: d.kind,
    status: d.status,
    transport: d.transport ?? null,
    error: d.error ?? null,
    httpStatus: d.httpStatus ?? null,
    at: d.at,
  }));
}

// ---------------------------------------------------------------------------------------------------
// Loaders (RLS)
// ---------------------------------------------------------------------------------------------------

const isMissingTable = (e: unknown): boolean => pgErrorCode(e) === "42P01";

function channelView(row: AlertChannelRow, usedBy: number): AlertChannelView {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    target: row.kind === "email" ? row.target : null,
    targetHint: row.kind === "email" ? null : row.targetHint,
    locale: row.locale,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    lastTestAt: toIso(row.lastTestAt),
    lastTestStatus: row.lastTestStatus,
    lastTestError: row.lastTestError,
    usedBy,
  };
}

/** Channels, rules and the organization's sites for the settings page. */
export async function loadAlertSettings(ctx: OrgContext): Promise<AlertSettings> {
  return withOrg(ctx, async (tx) => {
    const siteRows = await tx
      .select({ id: sites.id, name: sites.name })
      .from(sites)
      .where(and(eq(sites.organizationId, ctx.organization.id), isNull(sites.deletedAt)))
      .orderBy(sites.name);
    try {
      const [channelRows, ruleRows] = await tx.transaction(async (sp) =>
        Promise.all([
          sp
            .select()
            .from(alertChannels)
            .where(eq(alertChannels.organizationId, ctx.organization.id))
            .orderBy(alertChannels.createdAt),
          sp
            .select()
            .from(alertRules)
            .where(eq(alertRules.organizationId, ctx.organization.id))
            .orderBy(alertRules.createdAt),
        ]),
      );
      const usage = new Map<string, number>();
      for (const r of ruleRows)
        for (const id of r.channelIds) usage.set(id, (usage.get(id) ?? 0) + 1);
      const siteName = new Map(siteRows.map((s) => [s.id, s.name]));
      return {
        channels: channelRows.map((c) => channelView(c, usage.get(c.id) ?? 0)),
        rules: ruleRows.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          siteId: r.siteId,
          siteName: r.siteId ? (siteName.get(r.siteId) ?? null) : null,
          threshold: previewValues(r.kind, r.threshold),
          channelIds: r.channelIds,
          channelNames: channelNamesFor(r.channelIds, channelRows),
          enabled: r.enabled,
          cooldownMinutes: r.cooldownMinutes,
          lastEvaluatedAt: toIso(r.lastEvaluatedAt),
          createdAt: r.createdAt.toISOString(),
        })),
        sites: siteRows,
        migrationMissing: false,
      };
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      logger.warn("alert tables missing: apply migration 0013_alerts");
      return { channels: [], rules: [], sites: siteRows, migrationMissing: true };
    }
  });
}

/** One page of the alert history with filters; the deep-linked event is always on the page (as its own entry when filtered out). */
export async function loadAlertHistory(
  ctx: OrgContext,
  filters: AlertHistoryFilters,
): Promise<AlertHistoryPage> {
  return withOrg(ctx, async (tx) => {
    try {
      return await tx.transaction(async (sp) => {
        const where = [eq(alertEvents.organizationId, ctx.organization.id)];
        if (filters.severity !== "all") where.push(eq(alertEvents.severity, filters.severity));
        if (filters.kind !== "all") where.push(eq(alertEvents.kind, filters.kind));
        if (filters.state === "open") where.push(isNull(alertEvents.resolvedAt));
        if (filters.state === "resolved") where.push(sql`${alertEvents.resolvedAt} IS NOT NULL`);
        const [countRow] = await sp
          .select({
            total: sql<number>`count(*)::int`,
            open: sql<number>`count(*) FILTER (WHERE ${alertEvents.resolvedAt} IS NULL)::int`,
          })
          .from(alertEvents)
          .where(eq(alertEvents.organizationId, ctx.organization.id));
        const [filteredRow] = await sp
          .select({ total: sql<number>`count(*)::int` })
          .from(alertEvents)
          .where(and(...where));
        const total = Number(filteredRow?.total ?? 0);
        const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
        const page = Math.min(filters.page, pageCount);
        const rows = await sp
          .select()
          .from(alertEvents)
          .where(and(...where))
          .orderBy(desc(alertEvents.triggeredAt))
          .limit(HISTORY_PAGE_SIZE)
          .offset((page - 1) * HISTORY_PAGE_SIZE);
        if (filters.eventId && !rows.some((r) => r.id === filters.eventId)) {
          const [linked] = await sp
            .select()
            .from(alertEvents)
            .where(
              and(
                eq(alertEvents.organizationId, ctx.organization.id),
                eq(alertEvents.id, filters.eventId),
              ),
            )
            .limit(1);
          if (linked) rows.unshift(linked);
        }
        const ruleIds = [
          ...new Set(rows.map((r) => r.ruleId).filter((id): id is string => Boolean(id))),
        ];
        const siteIds = [
          ...new Set(rows.map((r) => r.siteId).filter((id): id is string => Boolean(id))),
        ];
        const [ruleRows, siteRows, channelRows] = await Promise.all([
          ruleIds.length
            ? sp
                .select({ id: alertRules.id, name: alertRules.name })
                .from(alertRules)
                .where(inArray(alertRules.id, ruleIds))
            : Promise.resolve([]),
          siteIds.length
            ? sp
                .select({ id: sites.id, name: sites.name })
                .from(sites)
                .where(inArray(sites.id, siteIds))
            : Promise.resolve([]),
          sp
            .select({ id: alertChannels.id, name: alertChannels.name })
            .from(alertChannels)
            .where(eq(alertChannels.organizationId, ctx.organization.id)),
        ]);
        const ruleName = new Map(ruleRows.map((r) => [r.id, r.name]));
        const siteName = new Map(siteRows.map((s) => [s.id, s.name]));
        const channelName = new Map(channelRows.map((c) => [c.id, c.name]));
        return {
          entries: rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            severity: r.severity,
            ruleName: r.ruleId ? (ruleName.get(r.ruleId) ?? null) : null,
            siteId: r.siteId,
            siteName: r.siteId ? (siteName.get(r.siteId) ?? null) : null,
            subjectKey: r.subjectKey,
            title: r.title,
            detail: r.detail,
            triggeredAt: r.triggeredAt.toISOString(),
            resolvedAt: toIso(r.resolvedAt),
            resolvedBy: r.resolvedAt ? (r.resolvedBy ? "user" : "auto") : null,
            notifiedAt: toIso(r.notifiedAt),
            delivery: deliveryRows(r.delivery, channelName),
          })),
          total,
          openTotal: Number(countRow?.open ?? 0),
          page,
          pageCount,
          migrationMissing: false,
        };
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      return { entries: [], total: 0, openTotal: 0, page: 1, pageCount: 1, migrationMissing: true };
    }
  });
}

/** Destinations and environments of the active site that Incident Mode can pause, with what is live. */
export async function loadIncidentTargets(
  ctx: OrgContext,
  workspace: Workspace,
): Promise<IncidentTargets> {
  const site = workspace.site;
  if (!site)
    return { destinations: [], environments: [], signingAvailable: Boolean(signingKeys()) };
  return withOrg(ctx, async (tx) => {
    const integrationRows = await tx
      .select()
      .from(integrations)
      .where(and(eq(integrations.siteId, site.id), sql`${integrations.status} <> 'draft'`))
      .orderBy(integrations.name);
    const envRows = await tx
      .select()
      .from(environments)
      .where(eq(environments.siteId, site.id))
      .orderBy(desc(environments.isDefault), environments.kind);
    const envViews: IncidentEnvironment[] = [];
    for (const e of envRows) {
      const active = await activeVersion(tx, e.id);
      let killSwitch: boolean | null = null;
      if (active) {
        const parsed = configBundleSchema.safeParse(active.bundle);
        killSwitch = parsed.success ? parsed.data.settings.kill_switch : null;
      }
      envViews.push({
        id: e.id,
        kind: e.kind,
        name: e.name,
        testMode: e.testMode,
        siteId: site.id,
        siteName: site.name,
        activeVersion: active?.version ?? null,
        killSwitch,
        publishedAt: active ? active.createdAt.toISOString() : null,
      });
    }
    return {
      destinations: integrationRows.map((i) => ({
        id: i.id,
        name: i.name,
        connectorType: i.connectorType,
        status: i.status,
        pausedAt: toIso(i.pausedAt),
        testMode: i.testMode,
        siteId: site.id,
        siteName: site.name,
      })),
      environments: envViews,
      signingAvailable: Boolean(signingKeys()),
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// Incident Mode: environment kill switch through the publication mechanics
// ---------------------------------------------------------------------------------------------------

export type KillSwitchError = "signing" | "not_found" | "unchanged" | "lint" | "generic";

/**
 * Publishes a signed version derived from the live bundle with `settings.kill_switch` toggled — the
 * browser tracker of that environment stops (or resumes) with the next config fetch while server-side
 * events, other environments and every destination keep running. The open draft is not touched.
 */
export async function setEnvironmentKillSwitch(
  ctx: OrgContext,
  environmentId: string,
  on: boolean,
): Promise<
  { ok: true; version: number; versionId: string } | { ok: false; error: KillSwitchError }
> {
  const keys = signingKeys();
  if (!keys) return { ok: false, error: "signing" };
  return withOrg(ctx, async (tx) => {
    const [envRow] = await tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.id, environmentId),
          eq(environments.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!envRow) return { ok: false, error: "not_found" };
    const active = await activeVersion(tx, envRow.id);
    if (active) {
      const parsed = configBundleSchema.safeParse(active.bundle);
      if (parsed.success && parsed.data.settings.kill_switch === on)
        return { ok: false, error: "unchanged" };
    } else if (!on) {
      return { ok: false, error: "unchanged" };
    }
    try {
      const version = await publishDerivedVersion(tx, {
        environmentId: envRow.id,
        mutate: (bundle) => {
          bundle.settings.kill_switch = on;
        },
        summary: on
          ? "Incident Mode: browser tracking paused (kill switch on)"
          : "Incident Mode: browser tracking resumed (kill switch off)",
        actor: ctx.tenant.actor,
        userId: ctx.user.id,
        keys: { keyId: keys.keyId, privateKeyBase64: keys.privateKeyBase64 },
        requestId: ctx.tenant.requestId,
        metadata: { source: "incident_mode" },
      });
      await recordAudit(tx, {
        organizationId: ctx.organization.id,
        actor: ctx.tenant.actor,
        action: on ? "incident.environment_pause" : "incident.environment_resume",
        targetType: "environment",
        targetId: envRow.id,
        diff: {
          siteId: envRow.siteId,
          environmentKind: envRow.kind,
          fromVersion: active?.version ?? null,
          toVersion: version.version,
          killSwitch: on,
        },
        metadata: { source: "incident_mode" },
        requestId: ctx.tenant.requestId,
      });
      return { ok: true, version: version.version, versionId: version.id };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn(
        { environmentId: envRow.id, err: message },
        "incident kill switch publish failed",
      );
      return { ok: false, error: message.includes("lint") ? "lint" : "generic" };
    }
  });
}

// ---------------------------------------------------------------------------------------------------
// Test notification (dashboard side; the worker has its own delivery path)
// ---------------------------------------------------------------------------------------------------

export type TestNotificationError =
  | "vault_missing"
  | "decrypt_failed"
  | "target_missing"
  | "timeout"
  | "rejected"
  | "mail_failed"
  | "generic";

export interface TestNotificationResult {
  ok: boolean;
  transport: string | null;
  httpStatus: number | null;
  error: TestNotificationError | null;
  detail: string | null;
}

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<{
  ok: boolean;
  status: number | null;
  error: TestNotificationError | null;
  detail: string | null;
}> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": ALERT_USER_AGENT, ...headers },
      body,
      signal: AbortSignal.timeout(ALERT_FETCH_TIMEOUT_MS),
      redirect: "manual",
    });
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : "rejected",
      detail: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      status: null,
      error: timeout ? "timeout" : "generic",
      detail: timeout ? null : e instanceof Error ? e.message.slice(0, 200) : null,
    };
  }
}

/** Sends a clearly labelled test through one channel and records the outcome on it. */
export async function sendTestNotification(
  ctx: OrgContext,
  channel: AlertChannelRow,
): Promise<TestNotificationResult> {
  const t = await getTranslations({ locale: channel.locale, namespace: "alerts.test" });
  const now = new Date();
  const url = `${env().HOST_APP}/settings/alerts`;
  const title = t("title");
  const summary = t("summary", { channel: channel.name });
  let result: TestNotificationResult;
  if (channel.kind === "email") {
    if (!channel.target)
      result = {
        ok: false,
        transport: null,
        httpStatus: null,
        error: "target_missing",
        detail: null,
      };
    else {
      const mail = await sendMail({
        to: channel.target,
        subject: t("subject", { title }),
        text: t("body", { summary, url }),
      });
      result = {
        ok: mail.ok,
        transport: mail.transport,
        httpStatus: null,
        error: mail.ok ? null : "mail_failed",
        detail: mail.ok ? null : (mail.error ?? null),
      };
    }
  } else {
    const v = vault();
    if (!v)
      result = {
        ok: false,
        transport: null,
        httpStatus: null,
        error: "vault_missing",
        detail: null,
      };
    else if (!channel.targetCiphertext)
      result = {
        ok: false,
        transport: null,
        httpStatus: null,
        error: "target_missing",
        detail: null,
      };
    else {
      let target: string | null;
      let secret: string | null = null;
      try {
        const aad = `alert_channel:${channel.id}`;
        target = await v.decrypt(channel.targetCiphertext, aad);
        secret = channel.secretCiphertext ? await v.decrypt(channel.secretCiphertext, aad) : null;
      } catch {
        target = null;
      }
      if (!target)
        result = {
          ok: false,
          transport: null,
          httpStatus: null,
          error: "decrypt_failed",
          detail: null,
        };
      else {
        const notification: AlertNotification = {
          id: `test-${now.getTime()}`,
          type: "alert.test",
          kind: "event_drop",
          severity: "info",
          title,
          summary,
          organizationId: ctx.organization.id,
          siteId: null,
          siteName: null,
          triggeredAt: now.toISOString(),
          detail: { channel: channel.name, test: true },
          url,
        };
        if (channel.kind === "slack") {
          const res = await postJson(
            target,
            JSON.stringify(
              alertSlackPayload(notification, {
                severity: t("labels.severity"),
                site: t("labels.site"),
                open: t("labels.open"),
              }),
            ),
            {},
          );
          result = {
            ok: res.ok,
            transport: "slack",
            httpStatus: res.status,
            error: res.error,
            detail: res.detail,
          };
        } else {
          const body = alertWebhookBody(notification);
          const headers: Record<string, string> = { [ALERT_EVENT_HEADER]: notification.type };
          if (secret)
            headers[ALERT_SIGNATURE_HEADER] = await alertSignatureHeader(body, secret, now);
          const res = await postJson(target, body, headers);
          result = {
            ok: res.ok,
            transport: secret ? "webhook_signed" : "webhook",
            httpStatus: res.status,
            error: res.error,
            detail: res.detail,
          };
        }
      }
    }
  }
  await withOrg(ctx, async (tx) => {
    await tx
      .update(alertChannels)
      .set({
        lastTestAt: now,
        lastTestStatus: result.ok ? "sent" : "failed",
        lastTestError: result.ok
          ? null
          : [result.error, result.detail].filter(Boolean).join(": ").slice(0, 300),
      })
      .where(eq(alertChannels.id, channel.id));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "alert_channel.test",
      targetType: "alert_channel",
      targetId: channel.id,
      diff: {
        kind: channel.kind,
        ok: result.ok,
        transport: result.transport,
        httpStatus: result.httpStatus,
        error: result.error,
      },
      requestId: ctx.tenant.requestId,
    });
  });
  return result;
}

/** One channel of the active organization by id (RLS), or null. */
export async function getOrgChannel(
  ctx: OrgContext,
  channelId: string,
): Promise<AlertChannelRow | null> {
  return withOrg(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(alertChannels)
      .where(
        and(eq(alertChannels.organizationId, ctx.organization.id), eq(alertChannels.id, channelId)),
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

export type { Tx };
