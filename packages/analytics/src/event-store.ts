import type { CanonicalEvent } from "@track-site/events";

/**
 * Event store abstraction. `PgEventStore` (partitioned PostgreSQL) is the tested reference;
 * `ClickHouseEventStore` is the production adapter for high volumes.
 */
export interface InsertResult {
  inserted: number;
  duplicates: number;
  /** event ids that were duplicates of an existing (site_id, source_event_id) */
  duplicateEventIds: string[];
}

export interface EventFilter {
  siteId: string;
  environmentId?: string;
  from?: Date;
  to?: Date;
  name?: string;
  processingState?: string;
  anonymousId?: string;
  source?: string;
  limit?: number;
  before?: string;
}

export interface EventCountRow {
  bucket: string;
  name: string;
  source: string;
  count: number;
  dropped: number;
}

export interface DeliveryMark {
  integrationId: string;
  status: "delivered" | "failed" | "skipped" | "pending";
  attempts: number;
  at: string;
}

export interface SubjectRef {
  anonymousId?: string;
  userId?: string;
  emailHash?: string;
}

export interface EventStore {
  readonly driver: "pg" | "clickhouse";
  insert(events: CanonicalEvent[]): Promise<InsertResult>;
  getById(siteId: string, eventId: string): Promise<CanonicalEvent | null>;
  query(filter: EventFilter): Promise<CanonicalEvent[]>;
  counts(siteId: string, from: Date, to: Date, bucket: "hour" | "day"): Promise<EventCountRow[]>;
  markDelivery(siteId: string, eventId: string, mark: DeliveryMark): Promise<void>;
  updateState(siteId: string, eventId: string, state: string, dropReason: string | null): Promise<void>;
  lastEventAt(siteId: string, source?: "browser" | "server"): Promise<Date | null>;
  deleteSubject(siteId: string, subject: SubjectRef): Promise<number>;
  deleteOlderThan(siteId: string | null, before: Date): Promise<number>;
  close(): Promise<void>;
}
