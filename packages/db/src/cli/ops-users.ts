import { config as loadDotenv } from "dotenv";
import { asc, ne } from "drizzle-orm";
import path from "node:path";
import { createDb, createPool } from "../client.ts";
import { user } from "../schema/auth.ts";

/**
 * Lists every user with a platform role (docs/17-operations-console.md):
 *
 *   pnpm --filter @track-site/db ops:users
 *
 * Prints e-mail, name, role, two-factor state and creation date — never secrets or session data.
 */
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("ops:users: DATABASE_URL (or DATABASE_URL_UNPOOLED) is required");
  process.exit(1);
}

const pool = createPool(url, { max: 1 });
const db = createDb(pool);
try {
  const rows = await db
    .select({
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      twoFactorEnabled: user.twoFactorEnabled,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(ne(user.platformRole, "NONE"))
    .orderBy(asc(user.platformRole), asc(user.email));
  if (!rows.length) {
    process.stdout.write(
      "no users with a platform role — grant the first admin with ops:grant --email … --role PLATFORM_ADMIN\n",
    );
  } else {
    const lines = rows.map(
      (r) =>
        `${r.platformRole.padEnd(17)} ${r.email.padEnd(40)} ${(r.name || "-").padEnd(28)} 2fa=${r.twoFactorEnabled ? "on " : "off"} verified=${r.emailVerified ? "yes" : "no "} since=${r.createdAt.toISOString().slice(0, 10)}`,
    );
    process.stdout.write(
      `${rows.length} platform user${rows.length === 1 ? "" : "s"}\n${lines.join("\n")}\n`,
    );
  }
} finally {
  await pool.end();
}
