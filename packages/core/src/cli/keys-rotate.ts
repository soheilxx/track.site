/**
 * Master key rotation entry point. Validates the configuration and points to the DB-aware
 * implementation so `@track-site/core` stays free of database dependencies.
 *
 * Usage:
 *   MASTER_KEY=<new> MASTER_KEY_ID=<new-id> LEGACY_MASTER_KEY=<old> LEGACY_MASTER_KEY_ID=<old-id> \
 *   DATABASE_URL=... pnpm --filter @track-site/db rotate-secrets
 */
const required = ["MASTER_KEY", "MASTER_KEY_ID", "LEGACY_MASTER_KEY", "LEGACY_MASTER_KEY_ID", "DATABASE_URL"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`missing env: ${missing.join(", ")}`);
  process.exit(1);
}
console.error("configuration ok; run: pnpm --filter @track-site/db rotate-secrets");
