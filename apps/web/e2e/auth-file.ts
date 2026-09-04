import path from "node:path";
import { fileURLToPath } from "node:url";

/** Stored session of the seeded owner, written by `auth.setup.ts` (git-ignored). */
export const AUTH_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".auth/owner.json");
