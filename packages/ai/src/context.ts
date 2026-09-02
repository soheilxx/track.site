import type { AppLogger, SecretVault } from "@track-site/core";
import type { Db } from "@track-site/db";
import type { Queue } from "@track-site/queue";

/**
 * Everything a tool may touch. Tenant, site, user and role are resolved by the server from the
 * authenticated session before the turn starts; the model can never change them.
 */
export interface AgentContext {
  organizationId: string;
  siteId: string;
  environmentId: string;
  userId: string;
  role: string;
  locale: string;
  chatSessionId: string;
  requestId: string;
  db: Db;
  vault: SecretVault | null;
  queue: Queue | null;
  signingKeys: { keyId: string; privateKeyBase64: string } | null;
  approvalSecret: string;
  hosts: { cdn: string; ingest: string; app: string };
  fetch: typeof fetch;
  logger: AppLogger;
  now: () => Date;
  /** injected for tests / mock vendors */
  allowPrivateNetwork?: boolean;
}
