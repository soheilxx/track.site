import { PLAN_IDS, planRecords } from "@track-site/catalog";
import { config as loadDotenv } from "dotenv";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import path from "node:path";
import { createDb, createPool } from "../client.ts";
import { account, member, organization, twoFactor, user } from "../schema/auth.ts";
import { plans } from "../schema/billing.ts";
import { consentPolicies } from "../schema/consent.ts";
import { integrations } from "../schema/config.ts";
import { siteSetupStates } from "../schema/ai.ts";
import { SUPPORT_SEEDED_TEAM_IDS, supportEvents, supportMacros, supportMessages, supportSettings, supportSlaPolicies, supportTeamMembers, supportTeams, supportTickets, type SupportBusinessHours } from "../schema/support.ts";
import { domains, environments, orgSettings, sites } from "../schema/tenancy.ts";

/**
 * Seeds configuration (the `plans` table, synced from the tariff catalogue; the support desk's default SLA
 * policy, global macros and settings row of migration 0015 — `ON CONFLICT DO NOTHING`, so edits made in
 * Support → Settings survive re-runs) and, when SEED_DEMO=true, a fully synthetic demo organization with a
 * handful of demo support tickets (one of them SLA-breached). Refuses to seed demo data in production.
 * Never contains real people, tokens or customer data.
 */
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const seedDemo = (process.env.SEED_DEMO ?? "false").toLowerCase() === "true";
if (seedDemo && process.env.APP_ENV === "production") {
  console.error("refusing to seed demo data in production");
  process.exit(1);
}

const PLANS = planRecords();

// Support desk seeds (mirror of migration 0015_support_desk.sql; ids are fixed so re-runs are no-ops)
const SUPPORT_DEFAULT_POLICY_ID = "a0000000-0000-4000-8000-000000000501";
const SUPPORT_BUSINESS_HOURS: SupportBusinessHours = { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } };
const SUPPORT_DEFAULT_TARGETS = {
  urgent: { first_response_minutes: 60, resolution_minutes: 480 },
  high: { first_response_minutes: 240, resolution_minutes: 1440 },
  normal: { first_response_minutes: 480, resolution_minutes: 4320 },
  low: { first_response_minutes: 1440, resolution_minutes: 10080 },
} as const;
const SUPPORT_GLOBAL_MACROS = [
  {
    id: "a0000000-0000-4000-8000-000000000601",
    name: "Acknowledge receipt",
    category: "general",
    bodyText: "Hello {requester_name},\n\nthank you for your message — we have received it as ticket #{ticket_number} and are looking into it. We will get back to you as soon as we know more.\n\nKind regards\n{agent_name}\nTrack Support",
    actions: { status: "open" as const, assign_to_self: true },
    scope: "global" as const,
    ownerUserId: null,
  },
  {
    id: "a0000000-0000-4000-8000-000000000602",
    name: "Need more information",
    category: "general",
    bodyText: "Hello {requester_name},\n\nto look into this we need a little more information from you:\n\n- \n- \n\nSimply reply to this e-mail; the ticket (#{ticket_number}) stays open until we hear from you.\n\nKind regards\n{agent_name}\nTrack Support",
    actions: { status: "pending" as const },
    scope: "global" as const,
    ownerUserId: null,
  },
  {
    id: "a0000000-0000-4000-8000-000000000603",
    name: "Resolved – closing",
    category: "general",
    bodyText: "Hello {requester_name},\n\nwe consider ticket #{ticket_number} resolved and are closing it. If anything is still open, reply to this e-mail and the ticket reopens automatically.\n\nKind regards\n{agent_name}\nTrack Support",
    actions: { status: "solved" as const },
    scope: "global" as const,
    ownerUserId: null,
  },
];
/** tag that marks the synthetic demo tickets (the seed skips when any ticket carries it) */
const DEMO_TICKET_TAG = "demo-seed";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pool = createPool(url, { max: 2 });
const db = createDb(pool);
try {
  for (const p of PLANS) {
    await db
      .insert(plans)
      .values({ id: p.id, name: p.name, sortOrder: p.sortOrder, limits: p.limits, features: p.features, stripePriceEnv: p.stripePriceEnv, contactSales: p.contactSales, isPublic: p.isPublic })
      .onConflictDoUpdate({ target: plans.id, set: { name: p.name, sortOrder: p.sortOrder, limits: p.limits, features: p.features, stripePriceEnv: p.stripePriceEnv, contactSales: p.contactSales, isPublic: p.isPublic } });
  }
  // rows that are no longer in the catalogue (e.g. the former "scale" plan) are hidden, never sold again
  await db.update(plans).set({ isPublic: false }).where(notInArray(plans.id, [...PLAN_IDS]));
  console.error(`plans synced from the catalogue (${PLANS.length})`);

  // Support desk defaults (docs/18 §3 "Seeds"): the same rows migration 0015 inserts, kept here so a database
  // whose rows were deleted gets them back; existing rows (edited in Support → Settings) are left untouched.
  await db
    .insert(supportSlaPolicies)
    .values({
      id: SUPPORT_DEFAULT_POLICY_ID,
      name: "Default (all plans)",
      description: "Configurable default targets in business minutes. Applies to every plan without a policy of its own; adjust the values in Support → Settings → SLA.",
      planIds: null,
      priorities: SUPPORT_DEFAULT_TARGETS,
      businessHours: SUPPORT_BUSINESS_HOURS,
      escalation: { warning_percent: 80 },
      isDefault: true,
    })
    .onConflictDoNothing();
  await db.insert(supportMacros).values(SUPPORT_GLOBAL_MACROS).onConflictDoNothing();
  await db
    .insert(supportSettings)
    .values({ id: 1, inboundDomain: "support.track.site", fromName: "Track Support", fromAddress: "support@track.site", signatureText: "", autoReplyEnabled: false, autoAssignStrategy: "none", businessHours: SUPPORT_BUSINESS_HOURS, csatEnabled: true })
    .onConflictDoNothing();
  // the two teams of migration 0017 (docs/18 §"Agent-created tickets and teams"); fixed ids, renames survive re-runs
  await db
    .insert(supportTeams)
    .values([
      { id: SUPPORT_SEEDED_TEAM_IDS.support, slug: "support", name: "Support", description: "Customer support — the default queue of every ticket without a team of its own.", isDefault: true },
      { id: SUPPORT_SEEDED_TEAM_IDS.sales, slug: "sales", name: "Sales", description: "Prospects, demos and plan questions.", isDefault: false },
    ])
    .onConflictDoNothing();
  console.error("support desk defaults present (default SLA policy, 3 global macros, settings row, teams support + sales)");

  if (seedDemo) {
    const password = await hashPassword("Demo-Password-123!");

    // Dev platform admin for the Track Operations console (/ops). Not a member of any organization:
    // operators and tenants stay separate. No two-factor — fine locally with OPS_REQUIRE_2FA=false.
    const opsEmail = "ops@acme.test";
    const [ops] = await db.select({ id: user.id, platformRole: user.platformRole }).from(user).where(eq(user.email, opsEmail)).limit(1);
    let opsId = ops?.id;
    if (!ops) {
      const [row] = await db.insert(user).values({ name: "Otto Operator", email: opsEmail, emailVerified: true, platformRole: "PLATFORM_ADMIN", twoFactorEnabled: false }).returning();
      opsId = row!.id;
      await db.insert(account).values({ issuer: "local:credential", accountId: row!.id, providerId: "credential", userId: row!.id, password });
      console.error("dev platform admin seeded: ops@acme.test / Demo-Password-123! (PLATFORM_ADMIN, no two-factor)");
    } else if (ops.platformRole !== "PLATFORM_ADMIN") {
      await db.update(user).set({ platformRole: "PLATFORM_ADMIN" }).where(eq(user.id, ops.id));
      console.error("dev platform admin restored to PLATFORM_ADMIN: ops@acme.test");
    }

    // Dev platform support agent for the support desk (docs/18 §2): the second operator the ticket e2e spec
    // (`apps/web/e2e/support.spec.ts`) uses for presence / collision detection and the role restrictions
    // (no Settings, no Controls). Not a member of any organisation either; no two-factor.
    const supportEmail = "support@acme.test";
    const [supportAgent] = await db.select({ id: user.id, platformRole: user.platformRole }).from(user).where(eq(user.email, supportEmail)).limit(1);
    let supportId = supportAgent?.id;
    if (!supportAgent) {
      const [row] = await db.insert(user).values({ name: "Sam Support", email: supportEmail, emailVerified: true, platformRole: "PLATFORM_SUPPORT", twoFactorEnabled: false }).returning();
      supportId = row!.id;
      await db.insert(account).values({ issuer: "local:credential", accountId: row!.id, providerId: "credential", userId: row!.id, password });
      console.error("dev platform support agent seeded: support@acme.test / Demo-Password-123! (PLATFORM_SUPPORT, no two-factor)");
    } else if (supportAgent.platformRole !== "PLATFORM_SUPPORT") {
      await db.update(user).set({ platformRole: "PLATFORM_SUPPORT" }).where(eq(user.id, supportAgent.id));
      console.error("dev platform support agent restored to PLATFORM_SUPPORT: support@acme.test");
    }

    // Both operators belong to the default team "Support" (docs/18 §"Agent-created tickets and teams"): the
    // admin as lead, the support agent as member — the pool of the team-aware round robin and the team an
    // agent-created ticket defaults to. `ON CONFLICT DO NOTHING`: a role changed in the console survives.
    const memberships = await db
      .insert(supportTeamMembers)
      .values([
        { teamId: SUPPORT_SEEDED_TEAM_IDS.support, userId: opsId!, role: "lead" },
        { teamId: SUPPORT_SEEDED_TEAM_IDS.support, userId: supportId!, role: "member" },
      ])
      .onConflictDoNothing()
      .returning({ userId: supportTeamMembers.userId });
    if (memberships.length > 0) console.error(`team "support" memberships seeded: ${memberships.length} operator(s)`);
    else console.error('team "support" memberships already present, skipping');

    const existing = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, "acme-demo")).limit(1);
    if (existing.length) {
      console.error("demo organization already exists, skipping");
    } else {
      const [org] = await db.insert(organization).values({ name: "Acme Demo", slug: "acme-demo" }).returning();
      const orgId = org!.id;
      await db.insert(orgSettings).values({ organizationId: orgId, locale: "en" });
      const demoUsers = [
        { email: "owner@acme.test", name: "Olivia Owner", role: "OWNER" },
        { email: "dev@acme.test", name: "Devin Developer", role: "DEVELOPER" },
        { email: "analyst@acme.test", name: "Ana Analyst", role: "ANALYST" },
      ];
      for (const u of demoUsers) {
        const [row] = await db.insert(user).values({ name: u.name, email: u.email, emailVerified: true }).returning();
        await db.insert(account).values({ issuer: "local:credential", accountId: row!.id, providerId: "credential", userId: row!.id, password });
        await db.insert(member).values({ organizationId: orgId, userId: row!.id, role: u.role });
      }
      const [site] = await db
        .insert(sites)
        .values({ organizationId: orgId, trackingId: "A7K2Q9", name: "Acme Shop", primaryDomain: "shop.acme.test", businessType: "ecommerce", platform: "shopify", currency: "EUR" })
        .returning();
      const siteId = site!.id;
      await db.insert(environments).values([
        { organizationId: orgId, siteId, kind: "production", name: "Production", isDefault: true, testMode: false },
        { organizationId: orgId, siteId, kind: "staging", name: "Staging", isDefault: false, testMode: true },
      ]);
      await db.insert(domains).values({ organizationId: orgId, siteId, hostname: "shop.acme.test", isPrimary: true, verificationToken: "track-site-verify=demo-token-not-verified" });
      await db.insert(consentPolicies).values({ organizationId: orgId, siteId, version: 1, status: "draft" });
      await db.insert(integrations).values({ organizationId: orgId, siteId, connectorType: "webhook", name: "Demo webhook (draft)", status: "draft", publicConfig: { url: "https://example.test/webhook" } });
      await db.insert(siteSetupStates).values({ organizationId: orgId, siteId, currentStep: "installation", steps: { site: { status: "completed" }, business_type: { status: "completed" }, platform: { status: "completed" } } });
      console.error("demo organization seeded: acme-demo (owner@acme.test / Demo-Password-123!)");
    }

    // Dedicated account of `apps/web/e2e/security.spec.ts`: the spec enrols, uses and disables two-factor,
    // which rotates its session and, for a few seconds, makes every password sign-in of that account land
    // on the two-factor page — with an account of its own, the owner's stored session and the owner's
    // sign-ins in other specs stay untouched. ANALYST of the demo organisation (the dashboard renders,
    // the audit row goes into the tenant's log). Seeded on its own so an existing database gets it too,
    // and a run that crashed with two-factor enabled is reset here (secret and codes removed, flag off).
    const securityEmail = "security@acme.test";
    const [demoOrg] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, "acme-demo")).limit(1);
    const [securityUser] = await db.select({ id: user.id, twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.email, securityEmail)).limit(1);
    let securityId = securityUser?.id;
    if (!securityUser) {
      const [row] = await db.insert(user).values({ name: "Sam Security", email: securityEmail, emailVerified: true }).returning();
      securityId = row!.id;
      await db.insert(account).values({ issuer: "local:credential", accountId: row!.id, providerId: "credential", userId: row!.id, password });
      console.error("e2e security account seeded: security@acme.test / Demo-Password-123! (two-factor flows of security.spec.ts)");
    } else {
      const secrets = await db.delete(twoFactor).where(eq(twoFactor.userId, securityUser.id)).returning({ id: twoFactor.id });
      if (securityUser.twoFactorEnabled) await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, securityUser.id));
      if (secrets.length > 0 || securityUser.twoFactorEnabled) console.error("e2e security account reset: two-factor disabled for security@acme.test");
    }
    if (demoOrg && securityId) {
      const [membership] = await db.select({ id: member.id }).from(member).where(and(eq(member.userId, securityId), eq(member.organizationId, demoOrg.id))).limit(1);
      if (!membership) await db.insert(member).values({ organizationId: demoOrg.id, userId: securityId, role: "ANALYST" });
    }

    // Demo support tickets for acme-demo (docs/18): three synthetic conversations — an unanswered high-priority
    // ticket whose first-response and resolution clocks are breached (the worker's flags and events are written
    // here so the queue, the SLA panel and the reports have something to show), a pending ticket the demo
    // operator answered, and a solved ticket with a satisfaction rating. Due times are wall-clock minutes of the
    // default policy's targets (synthetic data, marked with the tag `demo-seed`); seeded once — any ticket with
    // the tag makes the block a no-op, so edits made in the console survive re-runs.
    const [taggedTicket] = await db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(sql`${DEMO_TICKET_TAG} = ANY(${supportTickets.tags})`)
      .limit(1);
    if (demoOrg && !taggedTicket) {
      const [opsUser] = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.email, opsEmail)).limit(1);
      const demoPeople = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.email, ["owner@acme.test", "dev@acme.test", "analyst@acme.test"]));
      const person = (email: string) => demoPeople.find((u) => u.email === email) ?? null;
      const now = Date.now();
      const fromAddress = "support@track.site";
      const insertDemoTicket = async (spec: {
        requester: { id: string; name: string; email: string } | null;
        requesterEmail: string;
        requesterName: string;
        subject: string;
        body: string;
        channel: "email" | "form" | "dashboard";
        priority: "low" | "normal" | "high";
        status: "open" | "pending" | "solved";
        createdAt: Date;
        assignee: { id: string; name: string } | null;
        reply: { at: Date; text: string } | null;
        pendingAt: Date | null;
        resolvedAt: Date | null;
        breached: boolean;
        satisfaction: { score: 1 | 2 | 3 | 4 | 5; comment: string; at: Date } | null;
      }) => {
        const targets = SUPPORT_DEFAULT_TARGETS[spec.priority];
        const firstResponseDueAt = new Date(spec.createdAt.getTime() + targets.first_response_minutes * MINUTE);
        const resolutionDueAt = new Date(spec.createdAt.getTime() + targets.resolution_minutes * MINUTE);
        const updatedAt = spec.satisfaction?.at ?? spec.resolvedAt ?? spec.pendingAt ?? spec.reply?.at ?? spec.createdAt;
        const [ticket] = await db
          .insert(supportTickets)
          .values({
            organizationId: demoOrg.id,
            requesterUserId: spec.requester?.id ?? null,
            requesterEmail: spec.requesterEmail,
            requesterName: spec.requesterName,
            subject: spec.subject,
            status: spec.status,
            priority: spec.priority,
            channel: spec.channel,
            category: spec.channel === "form" ? "support" : null,
            tags: [DEMO_TICKET_TAG],
            assigneeUserId: spec.assignee?.id ?? null,
            slaPolicyId: SUPPORT_DEFAULT_POLICY_ID,
            firstResponseDueAt,
            resolutionDueAt,
            firstRespondedAt: spec.reply?.at ?? null,
            resolvedAt: spec.resolvedAt,
            closedAt: null,
            lastCustomerMessageAt: spec.createdAt,
            lastAgentMessageAt: spec.reply?.at ?? null,
            breachedFirstResponse: spec.breached,
            breachedResolution: spec.breached,
            pausedAt: spec.status === "pending" ? spec.pendingAt : null,
            locale: "en",
            satisfaction: spec.satisfaction ? { score: spec.satisfaction.score, comment: spec.satisfaction.comment, answered_at: spec.satisfaction.at.toISOString() } : null,
            createdAt: spec.createdAt,
            updatedAt,
          })
          .returning({ id: supportTickets.id, number: supportTickets.number });
        const ticketId = ticket!.id;
        const org = demoOrg.id;
        const event = (kind: "created" | "status" | "priority" | "assignee" | "tags" | "merged" | "sla_breach" | "sla_warning" | "reply" | "note" | "csat" | "reopened", actorKind: "customer" | "agent" | "system", actorUserId: string | null, payload: Record<string, unknown>, createdAt: Date) =>
          db.insert(supportEvents).values({ ticketId, organizationId: org, actorKind, actorUserId, kind, payload, createdAt });
        const [inbound] = await db
          .insert(supportMessages)
          .values({ ticketId, organizationId: org, direction: "inbound", authorKind: "customer", authorUserId: spec.requester?.id ?? null, fromEmail: spec.requesterEmail, toEmails: [fromAddress], subject: spec.subject, textBody: spec.body, deliveryStatus: "na", createdAt: spec.createdAt })
          .returning({ id: supportMessages.id });
        await event("created", "customer", spec.requester?.id ?? null, { channel: spec.channel, priority: spec.priority, category: spec.channel === "form" ? "support" : null, attachments: 0, messageId: inbound!.id, seed: DEMO_TICKET_TAG }, spec.createdAt);
        if (spec.assignee) await event("assignee", "agent", spec.assignee.id, { from: null, to: spec.assignee.id, self: true }, new Date(spec.createdAt.getTime() + 5 * MINUTE));
        if (spec.reply) {
          const [outbound] = await db
            .insert(supportMessages)
            .values({ ticketId, organizationId: org, direction: "outbound", authorKind: "agent", authorUserId: spec.assignee?.id ?? null, fromEmail: fromAddress, toEmails: [spec.requesterEmail], subject: `Re: [Track #${ticket!.number}] ${spec.subject}`, textBody: spec.reply.text, messageId: `t${ticket!.number}.demo-seed-${ticketId.slice(0, 8)}@support.track.site`, deliveryStatus: "sent", createdAt: spec.reply.at })
            .returning({ id: supportMessages.id });
          await event("status", "agent", spec.assignee?.id ?? null, { from: "new", to: "open", reason: "agent_reply" }, spec.reply.at);
          await event("reply", "agent", spec.assignee?.id ?? null, { messageId: outbound!.id, direction: "outbound", firstResponse: true, attachments: 0 }, spec.reply.at);
        }
        if (spec.pendingAt) await event("status", "agent", spec.assignee?.id ?? null, { from: "open", to: "pending" }, spec.pendingAt);
        if (spec.resolvedAt) await event("status", "agent", spec.assignee?.id ?? null, { from: "open", to: "solved" }, spec.resolvedAt);
        if (spec.breached) {
          await event("sla_warning", "system", null, { clock: "first_response", dueAt: firstResponseDueAt.toISOString() }, new Date(firstResponseDueAt.getTime() - 0.2 * targets.first_response_minutes * MINUTE));
          await event("sla_breach", "system", null, { clock: "first_response", dueAt: firstResponseDueAt.toISOString() }, firstResponseDueAt);
          await event("sla_breach", "system", null, { clock: "resolution", dueAt: resolutionDueAt.toISOString() }, resolutionDueAt);
        }
        if (spec.satisfaction) await event("csat", "customer", spec.requester?.id ?? null, { score: spec.satisfaction.score }, spec.satisfaction.at);
        return ticket!.number;
      };
      const owner = person("owner@acme.test");
      const dev = person("dev@acme.test");
      const analyst = person("analyst@acme.test");
      const assignee = opsUser ? { id: opsUser.id, name: opsUser.name } : null;
      const breachedNumber = await insertDemoTicket({
        requester: owner,
        requesterEmail: "owner@acme.test",
        requesterName: owner?.name ?? "Olivia Owner",
        subject: "Purchase events missing in Meta Ads since Monday",
        body: "Since Monday our Meta Ads destination reports no purchase events although the shop is converting normally. The Live Event Explorer shows the purchases arriving. Can you check the delivery? This is blocking our campaign review.",
        channel: "dashboard",
        priority: "high",
        status: "open",
        createdAt: new Date(now - 3 * DAY),
        assignee: null,
        reply: null,
        pendingAt: null,
        resolvedAt: null,
        breached: true,
        satisfaction: null,
      });
      const pendingNumber = await insertDemoTicket({
        requester: dev,
        requesterEmail: "dev@acme.test",
        requesterName: dev?.name ?? "Devin Developer",
        subject: "Consent banner shows twice on Safari",
        body: "On Safari 18 the consent banner appears again after accepting. Chrome is fine. We use the standard consent policy, version 1. Steps: open the shop, accept, reload — the banner is back.",
        channel: "form",
        priority: "normal",
        status: "pending",
        createdAt: new Date(now - 1 * DAY - 2 * HOUR),
        assignee,
        reply: { at: new Date(now - 1 * DAY), text: `Hello ${dev?.name ?? "Devin"},\n\nthanks for the report. Could you tell us whether Safari's "Prevent cross-site tracking" setting is on, and send the exact banner version from the page source (data-ts-consent-version)? With that we can reproduce it.\n\nKind regards\n${opsUser?.name ?? "Track Support"}\nTrack Support` },
        pendingAt: new Date(now - 1 * DAY),
        resolvedAt: null,
        breached: false,
        satisfaction: null,
      });
      const solvedNumber = await insertDemoTicket({
        requester: analyst,
        requesterEmail: "analyst@acme.test",
        requesterName: analyst?.name ?? "Ana Analyst",
        subject: "Invoice for August missing in the billing page",
        body: "The invoice for August is not listed under Billing. Could you resend it or tell us where to find it?",
        channel: "email",
        priority: "low",
        status: "solved",
        createdAt: new Date(now - 6 * DAY),
        assignee,
        reply: { at: new Date(now - 6 * DAY + 3 * HOUR), text: `Hello ${analyst?.name ?? "Ana"},\n\nthe August invoice was issued on the 1st and is listed under Billing → Invoices once the payment settled; it is there now. Sorry for the delay.\n\nKind regards\n${opsUser?.name ?? "Track Support"}\nTrack Support` },
        pendingAt: null,
        resolvedAt: new Date(now - 5 * DAY),
        breached: false,
        satisfaction: { score: 5, comment: "Quick and clear, thank you.", at: new Date(now - 5 * DAY + HOUR) },
      });
      console.error(`demo support tickets seeded for acme-demo: #${breachedNumber} (open, SLA breached), #${pendingNumber} (pending), #${solvedNumber} (solved, rated)`);
    } else if (demoOrg) {
      console.error("demo support tickets already exist, skipping");
    }
  }
} finally {
  await pool.end();
}
