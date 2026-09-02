import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import path from "node:path";
import { createDb, createPool } from "../client.ts";
import { account, member, organization, user } from "../schema/auth.ts";
import { plans, type PlanLimits } from "../schema/billing.ts";
import { consentPolicies } from "../schema/consent.ts";
import { integrations } from "../schema/config.ts";
import { siteSetupStates } from "../schema/ai.ts";
import { domains, environments, orgSettings, sites } from "../schema/tenancy.ts";

/**
 * Seeds configuration (plans) and, when SEED_DEMO=true, a fully synthetic demo organization.
 * Refuses to seed demo data in production. Never contains real people, tokens or customer data.
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

const PLANS: Array<{ id: string; name: string; sort: number; limits: PlanLimits; features: string[]; env: { monthly: string | null; yearly: string | null }; contactSales: boolean }> = [
  {
    id: "starter",
    name: "Starter",
    sort: 1,
    limits: { sites: 1, eventsPerMonth: 50_000, destinations: 2, retentionDays: 90, teamMembers: 2, serverSide: false, exports: false, sso: false },
    features: ["1 site", "50,000 accepted events / month", "2 destinations", "AI setup assistant", "Consent engine", "Event debugger"],
    env: { monthly: "STRIPE_PRICE_STARTER_MONTHLY", yearly: "STRIPE_PRICE_STARTER_YEARLY" },
    contactSales: false,
  },
  {
    id: "growth",
    name: "Growth",
    sort: 2,
    limits: { sites: 5, eventsPerMonth: 500_000, destinations: 20, retentionDays: 180, teamMembers: 5, serverSide: true, exports: false, sso: false },
    features: ["5 sites", "500,000 accepted events / month", "All standard connectors", "Server-side tracking", "Shop integrations", "Data quality inbox"],
    env: { monthly: "STRIPE_PRICE_GROWTH_MONTHLY", yearly: "STRIPE_PRICE_GROWTH_YEARLY" },
    contactSales: false,
  },
  {
    id: "scale",
    name: "Scale",
    sort: 3,
    limits: { sites: 20, eventsPerMonth: 2_000_000, destinations: 100, retentionDays: 395, teamMembers: 25, serverSide: true, exports: true, sso: false },
    features: ["20 sites", "2,000,000 accepted events / month", "Teams and roles", "Exports", "13 months retention", "Priority support"],
    env: { monthly: "STRIPE_PRICE_SCALE_MONTHLY", yearly: "STRIPE_PRICE_SCALE_YEARLY" },
    contactSales: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    sort: 4,
    limits: { sites: 1000, eventsPerMonth: 100_000_000, destinations: 1000, retentionDays: 730, teamMembers: 1000, serverSide: true, exports: true, sso: true },
    features: ["Custom volume", "SSO", "SLA", "Data region and dedicated processing", "Custom retention"],
    env: { monthly: null, yearly: null },
    contactSales: true,
  },
];

const pool = createPool(url, { max: 2 });
const db = createDb(pool);
try {
  for (const p of PLANS) {
    await db
      .insert(plans)
      .values({ id: p.id, name: p.name, sortOrder: p.sort, limits: p.limits, features: p.features, stripePriceEnv: p.env, contactSales: p.contactSales, isPublic: true })
      .onConflictDoUpdate({ target: plans.id, set: { name: p.name, sortOrder: p.sort, limits: p.limits, features: p.features, stripePriceEnv: p.env, contactSales: p.contactSales } });
  }
  console.error(`plans seeded (${PLANS.length})`);

  if (seedDemo) {
    const existing = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, "acme-demo")).limit(1);
    if (existing.length) {
      console.error("demo organization already exists, skipping");
    } else {
      const [org] = await db.insert(organization).values({ name: "Acme Demo", slug: "acme-demo" }).returning();
      const orgId = org!.id;
      await db.insert(orgSettings).values({ organizationId: orgId, locale: "en" });
      const password = await hashPassword("Demo-Password-123!");
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
  }
} finally {
  await pool.end();
}
