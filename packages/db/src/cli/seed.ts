import { PLAN_IDS, planRecords } from "@track-site/catalog";
import { config as loadDotenv } from "dotenv";
import { and, eq, notInArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import path from "node:path";
import { createDb, createPool } from "../client.ts";
import { account, member, organization, twoFactor, user } from "../schema/auth.ts";
import { plans } from "../schema/billing.ts";
import { consentPolicies } from "../schema/consent.ts";
import { integrations } from "../schema/config.ts";
import { siteSetupStates } from "../schema/ai.ts";
import { domains, environments, orgSettings, sites } from "../schema/tenancy.ts";

/**
 * Seeds configuration (the `plans` table, synced from the tariff catalogue) and, when SEED_DEMO=true,
 * a fully synthetic demo organization. Refuses to seed demo data in production. Never contains real
 * people, tokens or customer data.
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

  if (seedDemo) {
    const password = await hashPassword("Demo-Password-123!");

    // Dev platform admin for the Track Operations console (/ops). Not a member of any organization:
    // operators and tenants stay separate. No two-factor — fine locally with OPS_REQUIRE_2FA=false.
    const opsEmail = "ops@acme.test";
    const [ops] = await db.select({ id: user.id, platformRole: user.platformRole }).from(user).where(eq(user.email, opsEmail)).limit(1);
    if (!ops) {
      const [row] = await db.insert(user).values({ name: "Otto Operator", email: opsEmail, emailVerified: true, platformRole: "PLATFORM_ADMIN", twoFactorEnabled: false }).returning();
      await db.insert(account).values({ issuer: "local:credential", accountId: row!.id, providerId: "credential", userId: row!.id, password });
      console.error("dev platform admin seeded: ops@acme.test / Demo-Password-123! (PLATFORM_ADMIN, no two-factor)");
    } else if (ops.platformRole !== "PLATFORM_ADMIN") {
      await db.update(user).set({ platformRole: "PLATFORM_ADMIN" }).where(eq(user.id, ops.id));
      console.error("dev platform admin restored to PLATFORM_ADMIN: ops@acme.test");
    }

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
  }
} finally {
  await pool.end();
}
