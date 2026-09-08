import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";
import { hostname, userInfo } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDb, createPool } from "../client.ts";
import { recordAudit } from "../repositories/audit.ts";
import { session, twoFactor, user } from "../schema/auth.ts";

/**
 * Emergency two-factor reset from the command line (docs/17-operations-console.md §"Two-factor reset"):
 *
 *   pnpm --filter @track-site/db ops:2fa-reset --email ops@example.com --reason "authenticator lost" [--ticket OPS-123]
 *
 * For the case the console cannot cover: the only platform admin lost the authenticator and every backup
 * code, so nobody can sign in to reset it from the UI. The command removes the TOTP secret and the backup
 * codes, switches two-factor off, revokes every session of that user (the next sign-in needs password +
 * fresh enrolment) and writes an append-only audit entry (actor kind "system", source cli:ops-two-factor-reset)
 * that carries the reason and ticket but never a secret. --email and --reason are mandatory; the command
 * never guesses a user. In production run it through the prod-env wrapper so the database URL never appears
 * in a shell history.
 */
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

function fail(message: string): never {
  console.error(`ops:2fa-reset: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    email: { type: "string" },
    reason: { type: "string" },
    ticket: { type: "string" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  process.stdout.write('usage: ops:2fa-reset --email <address> --reason "<why>" [--ticket <reference>]\n');
  process.exit(0);
}

const email = values.email?.trim().toLowerCase();
if (!email) fail("--email is required (the command never guesses a user)");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("--email is not an e-mail address");
const reason = values.reason?.trim() ?? "";
if (reason.length < 10) fail("--reason is required (at least 10 characters; it is written to the audit log)");
const ticket = values.ticket?.trim() || null;

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required");

const pool = createPool(url, { max: 1 });
const db = createDb(pool);
try {
  const [row] = await db
    .select({ id: user.id, email: user.email, twoFactorEnabled: user.twoFactorEnabled, platformRole: user.platformRole })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!row) fail(`no user with e-mail ${email}`);
  const result = await db.transaction(async (tx) => {
    const secrets = await tx.delete(twoFactor).where(eq(twoFactor.userId, row.id)).returning({ id: twoFactor.id });
    const sessions = await tx.delete(session).where(eq(session.userId, row.id)).returning({ id: session.id });
    await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, row.id));
    const changed = Boolean(row.twoFactorEnabled) || secrets.length > 0 || sessions.length > 0;
    if (changed) {
      await recordAudit(tx, {
        organizationId: null,
        actor: { kind: "system", name: "cli:ops-two-factor-reset" },
        action: "user.two_factor.reset",
        targetType: "user",
        targetId: row.id,
        diff: { twoFactorEnabled: { before: Boolean(row.twoFactorEnabled), after: false } },
        metadata: {
          reason,
          ticket,
          secretsRemoved: secrets.length,
          sessionsRevoked: sessions.length,
          platformRole: row.platformRole,
          host: hostname(),
          osUser: userInfo().username,
          appEnv: process.env.APP_ENV ?? "development",
        },
      });
    }
    return { changed, secrets: secrets.length, sessions: sessions.length };
  });
  process.stdout.write(
    result.changed
      ? `${email}: two-factor reset (secrets removed: ${result.secrets}, sessions revoked: ${result.sessions}, audit entry written). The next sign-in needs the password only; enrol again under Settings → Security.\n`
      : `${email}: two-factor was not enabled and no sessions existed; nothing changed\n`,
  );
} finally {
  await pool.end();
}
