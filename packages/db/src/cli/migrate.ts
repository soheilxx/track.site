import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { runMigrations } from "../migrate.ts";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required");
  process.exit(1);
}
runMigrations(url)
  .then(() => {
    console.error("migrations applied");
  })
  .catch((e) => {
    console.error("migration failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
