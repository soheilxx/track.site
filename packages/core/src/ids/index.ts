import { randomUUID } from "node:crypto";
import { ulid } from "ulid";

export * from "./tracking-id.ts";

/** UUID v4 for control-plane primary keys (DB default is gen_random_uuid()). */
export const newUuid = (): string => randomUUID();
/** Time-sortable ULID for events, queue messages and lineage ids. */
export const newUlid = (seedTime?: number): string => (seedTime === undefined ? ulid() : ulid(seedTime));

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_REGEX.test(v);
export const isUlid = (v: unknown): v is string => typeof v === "string" && ULID_REGEX.test(v);
