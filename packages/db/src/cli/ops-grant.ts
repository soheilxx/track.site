import { config as loadDotenv } from "dotenv";
import { and, eq, ne, count } from "drizzle-orm";
import { hostname, userInfo } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { PLATFORM_ROLES, type PlatformRole } from "@track-site/core";
import { createDb, createPool } from "../client.ts";
import { recordAudit } from "../repositories/audit.ts";
import { user } from "../schema/auth.ts";

/**
 * Grants or removes a platform role (docs/17-operations-console.md §"Granting the first admin"):
 *
 *   pnpm --filter @track-site/db ops:grant --email ops@example.com --role PLATFORM_ADMIN
 *   pnpm --filter @track-site/db ops:grant --email ops@example.com --role NONE [--force]
 *
 * Refuses to run without an explicit --email, refuses to demote the last PLATFORM_ADMIN unless --force is
 * given, writes an append-only audit entry (actor kind "system", source cli:ops-grant) and prints the
 * result without secrets (no session, no password hash, no tokens). The user must exist and have a verified
 * e-mail; the console additionally requires two-factor authentication (OPS_REQUIRE_2FA) at sign-in time.
 * In production run it through the prod-env wrapper so the database URL never appears in a shell history.
 */
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

function fail(message: string): never {
  console.error(`ops:grant: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    email: { type: "string" },
    role: { type: "string" },
    force: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  process.stdout.write(
    "usage: ops:grant --email <address> --role PLATFORM_ADMIN|PLATFORM_SUPPORT|NONE [--force]\n",
  );
  process.exit(0);
}

const email = values.email?.trim().toLowerCase();
if (!email) fail("--email is required (the command never guesses a user)");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("--email is not an e-mail address");
const role = values.role?.trim().toUpperCase();
if (!role) fail("--role is required (PLATFORM_ADMIN | PLATFORM_SUPPORT | NONE)");
if (!(PLATFORM_ROLES as readonly string[]).includes(role))
  fail(`unknown role "${role}" (PLATFORM_ADMIN | PLATFORM_SUPPORT | NONE)`);
const nextRole = role as PlatformRole;

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required");

const pool = createPool(url, { max: 1 });
const db = createDb(pool);
try {
  const [row] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      platformRole: user.platformRole,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!row)
    fail(`no user with e-mail ${email} — the person signs up first, then the role is granted`);
  const previous = (PLATFORM_ROLES as readonly string[]).includes(row.platformRole)
    ? (row.platformRole as PlatformRole)
    : "NONE";
  if (!row.emailVerified && nextRole !== "NONE")
    fail(`${email} has not verified the e-mail address yet`);
  if (previous === "PLATFORM_ADMIN" && nextRole !== "PLATFORM_ADMIN" && !values.force) {
    const [admins] = await db
      .select({ others: count() })
      .from(user)
      .where(and(eq(user.platformRole, "PLATFORM_ADMIN"), ne(user.id, row.id)));
    if (Number(admins?.others ?? 0) === 0)
      fail("refusing to remove the last PLATFORM_ADMIN (pass --force if you really mean it)");
  }
  if (previous === nextRole) {
    process.stdout.write(`${email} already has platform role ${nextRole}; nothing changed\n`);
  } else {
    await db.transaction(async (tx) => {
      await tx.update(user).set({ platformRole: nextRole }).where(eq(user.id, row.id));
      await recordAudit(tx, {
        organizationId: null,
        actor: { kind: "system", name: "cli:ops-grant" },
        action: "platform.role.set",
        targetType: "user",
        targetId: row.id,
        diff: { platformRole: { before: previous, after: nextRole } },
        metadata: {
          host: hostname(),
          osUser: userInfo().username,
          appEnv: process.env.APP_ENV ?? "development",
        },
      });
    });
    process.stdout.write(
      `${email}: platform role ${previous} → ${nextRole} (audit entry written)\n`,
    );
  }
  if (nextRole !== "NONE" && !row.twoFactorEnabled) {
    process.stdout.write(
      "note: two-factor authentication is not enabled for this account; the console requires it unless OPS_REQUIRE_2FA=false (never in production)\n",
    );
  }
} finally {
  await pool.end();
}
