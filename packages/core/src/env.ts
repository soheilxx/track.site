import { z } from "zod";

/**
 * Environment helpers. Parsing is lazy so production builds work without secrets present;
 * each app defines its own schema with these helpers and calls `loadEnv()` at runtime.
 */

export const envString = (fallback?: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : (fallback ?? null)));

export const envRequired = (name: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || v.trim().length === 0) {
        ctx.addIssue({ code: "custom", message: `${name} is required` });
        return z.NEVER;
      }
      return v.trim();
    });

export const envInt = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number.parseInt(v, 10) : fallback;
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    });

export const envBool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return fallback;
      return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
    });

export const envEnum = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const val = v?.trim();
      return val && (values as readonly string[]).includes(val) ? (val as T[number]) : fallback;
    });

export const envUrl = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim().replace(/\/+$/, "");
      return trimmed && /^https?:\/\/[^\s]+$/.test(trimmed) ? trimmed : fallback;
    });

export const appEnvValues = ["development", "test", "staging", "production"] as const;
export type AppEnv = (typeof appEnvValues)[number];

/** Shared base variables every app reads. */
export const baseEnvSchema = z.object({
  NODE_ENV: envEnum(["development", "test", "production"], "development"),
  APP_ENV: envEnum(appEnvValues, "development"),
  LOG_LEVEL: envEnum(["trace", "debug", "info", "warn", "error", "fatal"], "info"),
  DATA_REGION: envEnum(["eu"], "eu"),
  HOST_MARKETING: envUrl("http://localhost:3000"),
  HOST_APP: envUrl("http://localhost:3000/app"),
  HOST_API: envUrl("http://localhost:3000/api"),
  HOST_CDN: envUrl("http://localhost:3000/cdn"),
  HOST_INGEST: envUrl("http://localhost:3100"),
  KILL_SWITCH_GLOBAL: envBool(false),
});
export type BaseEnv = z.infer<typeof baseEnvSchema>;

const cache = new WeakMap<z.ZodType, unknown>();

/** Parse `process.env` once per schema; throws a readable error listing every problem. */
export function loadEnv<S extends z.ZodType>(schema: S, source: NodeJS.ProcessEnv = process.env): z.infer<S> {
  const cached = cache.get(schema);
  if (cached) return cached as z.infer<S>;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  cache.set(schema, parsed.data);
  return parsed.data as z.infer<S>;
}

/** Test helper: forget cached env for a schema. */
export function resetEnvCache(schema: z.ZodType): void {
  cache.delete(schema);
}

export function isProduction(env: { APP_ENV: AppEnv }): boolean {
  return env.APP_ENV === "production";
}
