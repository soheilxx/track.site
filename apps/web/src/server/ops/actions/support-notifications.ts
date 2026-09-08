"use server";

import { z } from "zod";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import {
  loadNotificationFeed,
  markNotificationsRead,
  runNotificationFanOut,
  saveAgentPreferences,
  touchAgentSeen,
  type AgentPreferences,
  type NotificationFeed,
} from "@/server/support/notifications";

/**
 * Notification centre of the ops shell (docs/18 §"Notifications"). Every action resolves the operator with
 * `requirePlatform("PLATFORM_SUPPORT", "platform.tickets.read")`, validates with zod and runs as
 * `tracksite_ops`; the operator only ever touches their own rows (`user_id = ctx.user.id`).
 *
 * - `pollSupportNotificationsAction` is the bell's heartbeat (every 30 s while the tab is visible): it
 *   refreshes the operator's last activity (the "online" signal), runs the fan-out for everyone, hands the
 *   claimed mails to the transport after the commit and returns the operator's feed. Like the ticket
 *   presence heartbeat it is deliberately not audited — it changes no ticket and would flood the log.
 * - Read markers are personal UI state, not a change to any ticket: not audited either.
 * - The e-mail preference is a stored setting and is audited (`platform.support_notifications.preferences`,
 *   diff before → after, target the operator's own user id).
 */

export type NotificationActionError = "forbidden" | "invalid" | "generic";

export interface NotificationFeedResult {
  ok: boolean;
  error: NotificationActionError | null;
  feed: NotificationFeed | null;
}

export interface NotificationActionResult {
  ok: boolean;
  error: NotificationActionError | null;
  /** rows changed */
  changed: number;
}

export interface NotificationPreferencesResult {
  ok: boolean;
  error: NotificationActionError | null;
  preferences: AgentPreferences | null;
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

async function contextOr(): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_SUPPORT", "platform.tickets.read");
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

/** Heartbeat + fan-out + feed (see the module comment). */
export async function pollSupportNotificationsAction(): Promise<NotificationFeedResult> {
  const ctx = await contextOr();
  if (!ctx) return { ok: false, error: "forbidden", feed: null };
  const now = new Date();
  const run = <T>(fn: Parameters<typeof withPlatform<T>>[1]) => withPlatform(ctx, fn);
  await run((tx) => touchAgentSeen(tx, ctx.user.id, now));
  await runNotificationFanOut(run, now);
  const feed = await run((tx) => loadNotificationFeed(tx, ctx.user.id, now));
  return { ok: true, error: null, feed };
}

/** Marks the given notifications (or all unread ones) of the operator as read. */
export async function markSupportNotificationsReadAction(input: { ids?: string[]; all?: boolean }): Promise<NotificationActionResult> {
  const ctx = await contextOr();
  if (!ctx) return { ok: false, error: "forbidden", changed: 0 };
  const parsed = z
    .object({ ids: z.array(uuid).max(200).optional(), all: z.boolean().optional() })
    .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, { message: "ids or all" })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", changed: 0 };
  const scope = parsed.data.all === true ? ("all" as const) : (parsed.data.ids ?? []);
  const changed = await withPlatform(ctx, (tx) => markNotificationsRead(tx, ctx.user.id, scope, new Date()));
  return { ok: true, error: null, changed };
}

/** Stores the operator's own e-mail preferences (audited with the before / after values). */
export async function updateSupportNotificationPreferencesAction(input: { emailOnAssignment: boolean; emailOnCustomerReply: boolean }): Promise<NotificationPreferencesResult> {
  const ctx = await contextOr();
  if (!ctx) return { ok: false, error: "forbidden", preferences: null };
  const parsed = z.object({ emailOnAssignment: z.boolean(), emailOnCustomerReply: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", preferences: null };
  const now = new Date();
  const after = await withPlatform(ctx, async (tx) => {
    const { before, after } = await saveAgentPreferences(tx, ctx.user.id, parsed.data, now);
    if (before.emailOnAssignment !== after.emailOnAssignment || before.emailOnCustomerReply !== after.emailOnCustomerReply) {
      await auditPlatform(
        ctx,
        {
          action: "platform.support_notifications.preferences",
          targetType: "support_agent_settings",
          targetId: ctx.user.id,
          diff: { before, after },
          metadata: { module: "support" },
        },
        tx,
      );
    }
    return after;
  });
  return { ok: true, error: null, preferences: after };
}
