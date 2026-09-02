import "server-only";
import type { Pool } from "pg";
import { AwsKmsKeyProvider, LocalKeyProvider, SecretVault, createLogger, type KeyProvider } from "@track-site/core";
import { createDb, createPool, type Db } from "@track-site/db";
import { createQueue, type Queue } from "@track-site/queue";
import { env } from "../env";

/** Process-wide singletons (Next.js dev re-imports modules; keep them on globalThis). */
interface Globals {
  pool?: Pool;
  db?: Db;
  queue?: Queue;
  vault?: SecretVault | null;
}
const g = globalThis as unknown as { __trackSite?: Globals };
const store: Globals = (g.__trackSite ??= {});

export const logger = createLogger("web");

export function pool(): Pool {
  if (!store.pool) {
    const e = env();
    if (!e.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    store.pool = createPool(e.DATABASE_URL, { max: 10 });
  }
  return store.pool;
}

export function db(): Db {
  if (!store.db) store.db = createDb(pool());
  return store.db;
}

export function queue(): Queue {
  if (!store.queue) {
    const e = env();
    store.queue = createQueue({ driver: e.QUEUE_DRIVER, pool: pool(), sqsQueueUrlPrefix: e.SQS_QUEUE_URL_PREFIX ?? undefined, awsRegion: e.AWS_REGION ?? undefined });
  }
  return store.queue;
}

/** Envelope-encryption vault; null when no master key is configured (credential storage disabled). */
export function vault(): SecretVault | null {
  if (store.vault === undefined) {
    const e = env();
    let primary: KeyProvider | null = null;
    if (e.KMS_DRIVER === "aws" && e.AWS_KMS_KEY_ID) primary = new AwsKmsKeyProvider(e.AWS_KMS_KEY_ID, e.AWS_REGION ?? "eu-central-1");
    else if (e.MASTER_KEY) primary = new LocalKeyProvider(e.MASTER_KEY, e.MASTER_KEY_ID ?? "local-v1");
    store.vault = primary ? new SecretVault(primary) : null;
  }
  return store.vault;
}

export function signingKeys(): { keyId: string; privateKeyBase64: string; publicKeyBase64: string } | null {
  const e = env();
  if (!e.CONFIG_SIGNING_PRIVATE_KEY || !e.CONFIG_SIGNING_PUBLIC_KEY) return null;
  return { keyId: e.CONFIG_SIGNING_KEY_ID ?? "cfg-v1", privateKeyBase64: e.CONFIG_SIGNING_PRIVATE_KEY, publicKeyBase64: e.CONFIG_SIGNING_PUBLIC_KEY };
}
