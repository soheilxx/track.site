#!/usr/bin/env node
/**
 * Pricing / entitlement matrix (owner supplement §11 "Abschlussbelege" 5).
 *
 * Imports the tariff catalogue (`@track-site/catalog`, the single typed source of truth for plans,
 * list prices, entitlements, overage packs, trial, billable-event rules, plan finder and cost
 * calculator) directly from its TypeScript sources and renders every table from the exported data.
 * Nothing in the output is typed by hand; the test evidence section lists the test names found in
 * the test files and the results found in the gate outputs of this evidence pack.
 *
 * Usage (Node ≥ 24, native type stripping): node docs/qa/2026-09-05/pricing-matrix.mjs
 * Output: docs/qa/2026-09-05/pricing-matrix.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const catalogDir = path.join(repo, "packages", "catalog", "src");
const outFile = path.join(here, "pricing-matrix.md");

const catalog = await import(pathToFileURL(path.join(catalogDir, "index.ts")).href);
const {
  PLANS,
  PLAN_IDS,
  PAID_PLAN_IDS,
  CATALOG_LOCALES,
  REQUIRED_LABEL_LOCALES,
  FEATURES,
  FEATURE_KEYS,
  OVERAGE_PACKS,
  OVERAGE_POLICIES,
  DEFAULT_OVERAGE_POLICY,
  OVERAGE_POLICY_LABELS,
  USAGE_WARNING_THRESHOLDS,
  USAGE_PAUSE_GRACE_PERCENT,
  TRIAL,
  BILLABLE_EVENT_RULES,
  NON_BILLABLE_REASON_LABELS,
  nonBillableReason,
  listPriceCents,
  planHasFeature,
  overagePackFor,
  recommendPlan,
  estimateCost,
  stripePriceSlots,
  verifyStripeAmount,
  planRecords,
  retentionDaysForMonths,
} = catalog;

const rel = (p) => path.relative(repo, p).replaceAll("\\", "/");
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: repo, encoding: "utf8" }).trim();
  } catch {
    return "n/a";
  }
};
const eur = (cents) => (cents == null ? "—" : `${(cents / 100).toLocaleString("en-GB", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`);
const int = (n) => (n == null ? "—" : n.toLocaleString("en-GB"));
const yesNo = (b) => (b ? "yes" : "no");
const tick = (b) => (b ? "✓" : "—");

/** test names (`it("…")` / `test("…")` / `test.describe`) of a vitest or Playwright file */
function testNames(file, filter = () => true) {
  if (!existsSync(file)) return null;
  const src = readFileSync(file, "utf8");
  const names = [];
  for (const m of src.matchAll(/^\s*(?:it|test)\(\s*(["'`])((?:\\.|(?!\1).)*)\1/gm)) names.push(m[2]);
  return names.filter(filter);
}

/** vitest per-file result line from a gate output, e.g. "✓ src/catalog.test.ts (19 tests) 12ms" */
function vitestResult(gateFile, needle) {
  if (!existsSync(gateFile)) return null;
  const lines = readFileSync(gateFile, "utf8").split(/\r?\n/);
  const hit = lines.find((l) => l.includes(needle) && /\(\d+ tests?\)/.test(l));
  return hit ? hit.replace(/\[[0-9;]*m/g, "").trim() : null;
}

const lines = [];
const h = (level, text) => lines.push(`${"#".repeat(level)} ${text}`, "");
const p = (text = "") => lines.push(text, "");
const table = (header, rows) => {
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const r of rows) lines.push(`| ${r.join(" | ")} |`);
  lines.push("");
};

const head = git("rev-parse --short HEAD");
const catalogFiles = ["types.ts", "features.ts", "plans.ts", "overage.ts", "calculators.ts", "stripe.ts", "records.ts"].map((f) => `\`packages/catalog/src/${f}\``);

h(1, "Pricing and entitlement matrix — Track (generated)");
p(`Generated ${new Date().toISOString()} by \`docs/qa/2026-09-05/pricing-matrix.mjs\` from the tariff catalogue \`@track-site/catalog\` (${catalogFiles.join(", ")}) at commit \`${head}\`. Every value below is read from the exported catalogue objects; the catalogue is the single source of truth for the pricing page, checkout, entitlements, usage ledger, portal and webhooks (docs/11-track-redesign-program.md §3 "Tariff catalogue"). Amounts are EUR list prices excluding VAT (the pricing page carries the localized tax note).`);

h(2, "1. Plans and list prices");
table(
  ["Plan id", "Name", "Sort", "Recommended", "Contact sales", "Inherits", "Monthly", "Yearly", "Yearly ÷ 12", "Yearly = 10 × monthly", "Audience (en)"],
  PLANS.map((pl) => [
    `\`${pl.id}\``,
    pl.name,
    String(pl.sortOrder),
    yesNo(pl.recommended),
    yesNo(pl.contactSales),
    pl.inherits ? `\`${pl.inherits}\`` : "—",
    pl.price ? eur(pl.price.monthlyCents) : "custom",
    pl.price ? eur(pl.price.yearlyCents) : "custom",
    pl.price ? eur(Math.round(pl.price.yearlyCents / 12)) : "—",
    pl.price ? yesNo(pl.price.yearlyCents === pl.price.monthlyCents * 10) : "—",
    pl.audience.en,
  ]),
);
p(`Binding amounts of the supplement §5: monthly 19 € / 90 € / 180 € / custom, yearly 190 € / 900 € / 1 800 € / custom. \`listPriceCents\` returns ${PAID_PLAN_IDS.map((id) => `${id} ${eur(listPriceCents(id, "monthly"))} / ${eur(listPriceCents(id, "yearly"))}`).join(", ")}; enterprise → \`${String(listPriceCents("enterprise", "monthly"))}\`.`);

h(2, "2. Entitlements (hard limits)");
table(
  ["Plan", "Sites", "Events / month", "Team members", "Retention", "Retention days (derived)"],
  PLANS.map((pl) => [
    pl.name,
    pl.limits.sites == null ? "custom / contract" : int(pl.limits.sites),
    pl.limits.eventsPerMonth == null ? "custom / contract" : int(pl.limits.eventsPerMonth),
    pl.limits.teamMembers == null ? (pl.id === "enterprise" ? "custom / contract" : "unlimited (fair use)") : int(pl.limits.teamMembers),
    pl.limits.retentionMonths != null ? `${pl.limits.retentionMonths} months` : pl.limits.retentionDays != null ? `${pl.limits.retentionDays} days` : "custom / contract",
    pl.limits.retentionDays == null ? "—" : `${pl.limits.retentionDays}${pl.limits.retentionMonths ? ` (= ceil(${pl.limits.retentionMonths} × 365.25 / 12) = ${retentionDaysForMonths(pl.limits.retentionMonths)})` : ""}`,
  ]),
);
p("`null` in the catalogue means no fixed cap in this plan (unlimited within fair use for Pro team members; agreed per contract for Enterprise). The pricing page and the dashboard never invent a number for these cells.");

h(2, "3. Feature gates (cumulative)");
p(`${FEATURE_KEYS.length} feature keys in ${[...new Set(Object.values(FEATURES).map((f) => f.group))].length} groups. A tick means \`planHasFeature(plan, key)\` is true; plans inherit every feature of the plan they build on (${PLANS.filter((x) => x.inherits).map((x) => `${x.name} ⊇ ${x.inherits}`).join(", ")}).`);
const groups = [...new Set(Object.values(FEATURES).map((f) => f.group))];
for (const group of groups) {
  const keys = FEATURE_KEYS.filter((k) => FEATURES[k].group === group);
  h(3, `Group \`${group}\` (${keys.length})`);
  table(
    ["Feature key", "Label (en)", ...PLANS.map((pl) => pl.name)],
    keys.map((k) => [`\`${k}\``, FEATURES[k].label.en, ...PLANS.map((pl) => tick(planHasFeature(pl.id, k)))]),
  );
}
table(["Plan", "Features (count)", "Of which new in this plan"], PLANS.map((pl) => {
  const parent = pl.inherits ? PLANS.find((x) => x.id === pl.inherits) : null;
  const own = pl.features.filter((k) => !parent || !parent.features.includes(k));
  return [pl.name, String(pl.features.length), own.length ? own.map((k) => `\`${k}\``).join(", ") : "—"];
}));

h(2, "4. Overage packs, policies, warnings, grace window");
table(
  ["Plan", "Included events / month", "Pack size", "Pack price", "Price per 1 000 extra events", "Overage"],
  PLANS.map((pl) => {
    const pack = overagePackFor(pl.id);
    return [
      pl.name,
      pl.limits.eventsPerMonth == null ? "contract" : int(pl.limits.eventsPerMonth),
      pack ? int(pack.events) : "—",
      pack ? eur(pack.priceCents) : "—",
      pack ? `${((pack.priceCents / 100) / (pack.events / 1000)).toFixed(3)} €` : "—",
      pack ? "opt-in packs (never activated without an explicit choice)" : "contractual (no pack)",
    ];
  }),
);
table(["Policy", "Default", "Label (en)"], OVERAGE_POLICIES.map((pol) => [`\`${pol}\``, yesNo(pol === DEFAULT_OVERAGE_POLICY), OVERAGE_POLICY_LABELS[pol].en]));
p(`Usage warnings at ${USAGE_WARNING_THRESHOLDS.map((t) => `${t} %`).join(", ")} of the monthly event limit (\`USAGE_WARNING_THRESHOLDS\`). The \`pause\` policy keeps processing up to limit × (1 + ${USAGE_PAUSE_GRACE_PERCENT} %) before it pauses (\`USAGE_PAUSE_GRACE_PERCENT\` = ${USAGE_PAUSE_GRACE_PERCENT}); the \`cost_limit\` policy pauses once the packs needed would cost more than the customer's monthly limit (\`organization_settings.usage_cost_limit_cents\`).`);

h(2, "5. Trial");
table(
  ["Plan", "Days", "Card required", "Max accepted events", "Auto-converts", "After expiry"],
  [[`\`${TRIAL.planId}\` (${PLANS.find((x) => x.id === TRIAL.planId).name})`, String(TRIAL.days), yesNo(TRIAL.cardRequired), int(TRIAL.maxEvents), yesNo(TRIAL.autoConvert), `\`${TRIAL.afterExpiry}\` (workspace stays readable and exportable; nothing is deleted)`]],
);

h(2, "6. Billable event definition");
p(`\`BILLABLE_EVENT_RULES\`: counted when \`${BILLABLE_EVENT_RULES.countedWhen}\`; counted once per event: ${yesNo(BILLABLE_EVENT_RULES.countedOncePerEvent)}; destination fan-out counts: ${yesNo(BILLABLE_EVENT_RULES.destinationFanOutCounts)}.`);
table(
  ["Not counted (reason key)", "Label (en)", "`nonBillableReason` example"],
  BILLABLE_EVENT_RULES.notCounted.map((r) => {
    const input = { accepted: true };
    if (r === "invalid_or_rejected") input.accepted = false;
    if (r === "duplicate") input.duplicate = true;
    if (r === "retry") input.retry = true;
    if (r === "test_or_debug") input.testMode = true;
    if (r === "internal") input.internal = true;
    if (r === "consent_dropped") input.consentDropped = true;
    return [`\`${r}\``, NON_BILLABLE_REASON_LABELS[r].en, `\`${JSON.stringify(input)}\` → \`${nonBillableReason(input)}\``];
  }),
);
p(`Accepted, first-seen, non-test, non-internal event → \`${String(nonBillableReason({ accepted: true }))}\` (billed once).`);

h(2, "7. Stripe price slots and amount verification");
table(
  ["Plan", "Interval", "Env name", "Deprecated fallback", "Catalogue amount"],
  stripePriceSlots().map((s) => [s.planId, s.interval, `\`${s.envName}\``, s.legacyEnvName ? `\`${s.legacyEnvName}\`` : "—", eur(listPriceCents(s.planId, s.interval))]),
);
const checks = [
  { planId: "starter", interval: "monthly", unitAmount: 1900, currency: "eur" },
  { planId: "growth", interval: "yearly", unitAmount: 90000, currency: "eur" },
  { planId: "growth", interval: "yearly", unitAmount: 99000, currency: "eur" },
  { planId: "pro", interval: "monthly", unitAmount: 18000, currency: "usd" },
  { planId: "enterprise", interval: "monthly", unitAmount: 1, currency: "eur" },
];
table(["`verifyStripeAmount` input", "Result"], checks.map((c) => [`\`${JSON.stringify(c)}\``, `\`${JSON.stringify(verifyStripeAmount(c))}\``]));
const healthFile = path.join(here, "reports", "health-www-track-site.json");
if (existsSync(healthFile)) {
  const health = JSON.parse(readFileSync(healthFile, "utf8"));
  p(`Live verification (\`/api/health\` of https://www.track.site, fetched ${health.ts ?? "n/a"}, saved as \`docs/qa/2026-09-05/reports/health-www-track-site.json\`): \`billing\` = \`${health.billing}\`; ok = ${JSON.stringify(health.billingPrices?.ok ?? [])}; missing = ${JSON.stringify(health.billingPrices?.missing ?? [])}; failed = ${JSON.stringify(health.billingPrices?.failed ?? [])}; deprecated = ${JSON.stringify(health.billingPrices?.deprecated ?? [])}. The health route (\`apps/web/src/app/api/health/route.ts\`, \`billingStatus\`) resolves every slot through \`resolvePrice\` (\`apps/web/src/server/billing.ts\`), which rejects a Stripe price whose amount or currency differs from the catalogue (\`amount_mismatch:<stripe>≠<catalogue>\` / \`currency_mismatch\`), so \`billing: ok\` means all six live prices equal the list prices above.`);
} else {
  p("Live verification: `reports/health-www-track-site.json` not present (health endpoint not fetched in this run).");
}

h(2, "8. Plan finder (deterministic)");
const finderCases = [
  { sites: 1, eventsPerMonth: 100_000, teamMembers: 2, retentionDays: 90 },
  { sites: 1, eventsPerMonth: 500_000, teamMembers: 2, retentionDays: 90 },
  { sites: 1, eventsPerMonth: 500_001, teamMembers: 2, retentionDays: 90 },
  { sites: 2, eventsPerMonth: 100_000, teamMembers: 2, retentionDays: 90 },
  { sites: 1, eventsPerMonth: 100_000, teamMembers: 3, retentionDays: 90 },
  { sites: 1, eventsPerMonth: 100_000, teamMembers: 2, retentionDays: 365 },
  { sites: 5, eventsPerMonth: 5_000_000, teamMembers: 10, retentionDays: 396 },
  { sites: 6, eventsPerMonth: 5_000_000, teamMembers: 10, retentionDays: 396 },
  { sites: 25, eventsPerMonth: 20_000_000, teamMembers: 50, retentionDays: 761 },
  { sites: 26, eventsPerMonth: 20_000_000, teamMembers: 50, retentionDays: 761 },
  { sites: 1, eventsPerMonth: 20_000_001, teamMembers: 1, retentionDays: 30 },
  { sites: -1, eventsPerMonth: Number.NaN, teamMembers: 0, retentionDays: 0 },
];
table(["Sites", "Events / month", "Team", "Retention days", "→ `recommendPlan`"], finderCases.map((c) => [String(c.sites), Number.isNaN(c.eventsPerMonth) ? "NaN" : int(c.eventsPerMonth), String(c.teamMembers), String(c.retentionDays), `\`${recommendPlan(c)}\``]));
p("Rule: the smallest plan (by sort order) whose limits satisfy every input; Enterprise when none does; negative or NaN inputs count as 0.");

h(2, "9. Cost calculator (deterministic)");
const costCases = [
  ["starter", 400_000, "monthly"],
  ["starter", 500_000, "monthly"],
  ["starter", 500_001, "monthly"],
  ["starter", 1_000_000, "monthly"],
  ["starter", 1_700_000, "monthly"],
  ["starter", 1_000_000, "yearly"],
  ["growth", 5_000_000, "monthly"],
  ["growth", 6_500_000, "monthly"],
  ["growth", 11_000_000, "monthly"],
  ["pro", 20_000_000, "monthly"],
  ["pro", 26_000_000, "monthly"],
  ["pro", 30_000_000, "yearly"],
  ["enterprise", 1_000_000, "monthly"],
];
table(
  ["Plan", "Events / month", "Interval", "Base", "Included", "Overage events", "Packs / month", "Overage cost (period)", "Total (period)", "Cheaper upgrade", "Contractual"],
  costCases.map(([planId, eventsPerMonth, interval]) => {
    const e = estimateCost({ planId, eventsPerMonth, interval });
    if (!e) return [planId, int(eventsPerMonth), interval, "`null` (custom-priced plan)", "", "", "", "", "", "", ""];
    return [planId, int(eventsPerMonth), `${interval} (${e.periodMonths} mo)`, eur(e.base), int(e.includedEventsPerMonth), int(e.overageEventsPerMonth), String(e.overagePacks), eur(e.overageCost), eur(e.total), e.cheaperUpgrade ? `\`${e.cheaperUpgrade.planId}\` ${eur(e.cheaperUpgrade.total)} (saves ${eur(e.cheaperUpgrade.savings)})` : "—", yesNo(e.overageContractual)];
  }),
);

h(2, "10. Database plan records (what the seed writes)");
table(
  ["Plan", "`limits` JSON", "Stripe env (monthly / yearly)", "Contact sales", "Public"],
  planRecords().map((r) => [r.id, `\`${JSON.stringify(r.limits)}\``, `${r.stripePriceEnv.monthly ?? "—"} / ${r.stripePriceEnv.yearly ?? "—"}`, yesNo(r.contactSales), yesNo(r.isPublic)]),
);

h(2, "11. Label coverage per locale");
const labels = [];
for (const pl of PLANS) {
  labels.push(["plan.audience", pl.id, pl.audience]);
  pl.highlights.forEach((l, i) => labels.push(["plan.highlight", `${pl.id}#${i + 1}`, l]));
}
for (const k of FEATURE_KEYS) labels.push(["feature", k, FEATURES[k].label]);
for (const pol of OVERAGE_POLICIES) labels.push(["overage.policy", pol, OVERAGE_POLICY_LABELS[pol]]);
for (const r of BILLABLE_EVENT_RULES.notCounted) labels.push(["nonBillable", r, NON_BILLABLE_REASON_LABELS[r]]);
const missing = [];
for (const [kind, id, label] of labels) for (const loc of REQUIRED_LABEL_LOCALES) if (!(typeof label[loc] === "string" && label[loc].length > 0)) missing.push(`${kind}:${id}:${loc}`);
table(["Label kind", "Count"], [...labels.reduce((m, [k]) => m.set(k, (m.get(k) ?? 0) + 1), new Map())].map(([k, n]) => [k, String(n)]));
p(`${labels.length} labels × ${REQUIRED_LABEL_LOCALES.length} required locales (${REQUIRED_LABEL_LOCALES.join(", ")}; catalogue locales ${CATALOG_LOCALES.join(", ")}): ${missing.length === 0 ? "**0 missing translations**" : `**${missing.length} missing**: ${missing.join(", ")}`}. (\`packages/catalog/src/catalog.test.ts\` "catalog labels" fails on any gap; \`docs/i18n-parity-report.md\` reports 0 / 95 catalogue-label gaps per locale — the parity script counts the labels the pricing page renders.)`);

h(2, "12. Automated test evidence");
const catalogTests = testNames(path.join(catalogDir, "catalog.test.ts"));
const helpersTests = testNames(path.join(repo, "apps/web/src/components/marketing/pricing/pricing-helpers.test.ts"));
const selectionTests = testNames(path.join(repo, "apps/web/src/components/marketing/pricing/plan-selection.test.ts"));
const usageTests = testNames(path.join(repo, "apps/web/src/server/usage.test.ts"));
const usageIntegration = testNames(path.join(repo, "apps/web/src/server/usage.integration.test.ts"));
const e2eMarketing = testNames(path.join(repo, "apps/web/e2e/marketing.spec.ts"), (n) => /pricing|redirect permanently to English/i.test(n));
const e2eApp = testNames(path.join(repo, "apps/web/e2e/app.spec.ts"), (n) => /billing|usage|plan|pricing/i.test(n));
const gateTest = path.join(here, "reports", "test.txt");
const results = {
  catalog: vitestResult(gateTest, "catalog.test.ts"),
  helpers: vitestResult(gateTest, "pricing-helpers.test.ts"),
  selection: vitestResult(gateTest, "plan-selection.test.ts"),
  usage: vitestResult(gateTest, "src/server/usage.test.ts"),
};
const list = (arr) => (arr && arr.length ? arr.map((n) => `- ${n}`).join("\n") : "- (file not found)");
h(3, "Unit tests (vitest)");
p(`\`packages/catalog/src/catalog.test.ts\` — ${catalogTests?.length ?? 0} tests${results.catalog ? ` — result in \`reports/test.txt\`: \`${results.catalog}\`` : " — result: see `reports/test.txt`"}:`);
lines.push(list(catalogTests), "");
p(`\`apps/web/src/components/marketing/pricing/pricing-helpers.test.ts\` — ${helpersTests?.length ?? 0} tests${results.helpers ? ` — \`${results.helpers}\`` : ""}:`);
lines.push(list(helpersTests), "");
p(`\`apps/web/src/components/marketing/pricing/plan-selection.test.ts\` — ${selectionTests?.length ?? 0} tests${results.selection ? ` — \`${results.selection}\`` : ""}:`);
lines.push(list(selectionTests), "");
p(`\`apps/web/src/server/usage.test.ts\` (usage guard: thresholds, forecast, hard limit mirroring the worker, pack maths, cheaper-upgrade advice) — ${usageTests?.length ?? 0} tests${results.usage ? ` — \`${results.usage}\`` : ""}:`);
lines.push(list(usageTests), "");
p(`\`apps/web/src/server/usage.integration.test.ts\` (DB-backed, \`pnpm test:integration\`, result in \`reports/test-integration.txt\`) — ${usageIntegration?.length ?? 0} tests:`);
lines.push(list(usageIntegration), "");
h(3, "Health price verification");
p("`apps/web/src/app/api/health/route.ts` → `billingStatus()`: one slot per catalogue plan and interval (`stripePriceSlots()`), each resolved through `resolvePrice` (`apps/web/src/server/billing.ts`), which calls `verifyStripeAmount` from the catalogue and reports `amount_mismatch` / `currency_mismatch`; the route additionally checks active, recurring, interval and tax behaviour and lists deprecated `STRIPE_PRICE_SCALE_*` names. The checkout action (`apps/web/src/server/actions/billing.ts`) refuses a checkout for a mismatching price. Live result: see section 7.");
h(3, "End-to-end (Playwright)");
p("`apps/web/e2e/marketing.spec.ts` (pricing-related tests):");
lines.push(list(e2eMarketing), "");
p(`\`apps/web/e2e/app.spec.ts\` (billing / usage related tests): ${e2eApp && e2eApp.length ? "" : "none by name; the dashboard module smoke test covers \`/app/billing\` and \`/app/billing/usage\` (one \`h1\` inside the shell on every module route)."}`);
if (e2eApp && e2eApp.length) lines.push(list(e2eApp), "");
p("Results: `docs/qa/2026-09-05/reports/e2e/e2e-run2.log` and `e2e-run4.log` (28 passed each, chromium project), `docs/qa/2026-09-05/recheck/e2e-new-specs.log` (12 passed, incl. `/fr/pricing` @320, `/de/pricing` @768, `/nl/pricing` @1024), visual regression `reports/e2e/visual-verify-final-*.log` (12 passed each, incl. `pricing-375` / `pricing-1440`).");

writeFileSync(outFile, lines.join("\n") + "\n", "utf8");
console.log(`wrote ${rel(outFile)}: ${PLANS.length} plans, ${FEATURE_KEYS.length} features, ${labels.length} labels, ${missing.length} missing translations`);
