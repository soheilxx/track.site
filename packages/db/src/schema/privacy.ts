import { index, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamps, tz } from "./_helpers.ts";
import { orgRef, sites } from "./tenancy.ts";

export const dataKindEnum = pgEnum("retention_data_kind", [
  "events",
  "click_ids",
  "consent_snapshots",
  "delivery_attempts",
  "audit_log",
  "chat_transcripts",
  "raw_archive",
  "dsar_records",
  "ip_hashes",
]);

export const RETENTION_DEFAULT_DAYS: Record<string, number> = {
  events: 395,
  click_ids: 90,
  consent_snapshots: 1095,
  delivery_attempts: 90,
  audit_log: 730,
  chat_transcripts: 30,
  raw_archive: 14,
  dsar_records: 1095,
  ip_hashes: 30,
};

export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    dataKind: dataKindEnum("data_kind").notNull(),
    days: integer("days").notNull(),
    updatedBy: uuid("updated_by"),
    ...timestamps(),
  },
  (t) => [unique("retention_policies_scope_uq").on(t.organizationId, t.siteId, t.dataKind).nullsNotDistinct()],
);

export const dsarKindEnum = pgEnum("dsar_kind", ["export", "delete", "restrict", "rectify", "object", "portability"]);
export const dsarStatusEnum = pgEnum("dsar_status", ["received", "in_progress", "completed", "rejected"]);

export const dataSubjectRequests = pgTable(
  "data_subject_requests",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    kind: dsarKindEnum("kind").notNull(),
    /** only hashed / pseudonymous identifiers are stored */
    subject: jsonb("subject").$type<{ emailHash?: string; userId?: string; anonymousId?: string; externalIdHash?: string }>().notNull(),
    status: dsarStatusEnum("status").notNull().default("received"),
    requestedBy: uuid("requested_by"),
    note: text("note"),
    requestedAt: tz("requested_at").notNull().defaultNow(),
    dueAt: tz("due_at").notNull(),
    completedAt: tz("completed_at"),
    report: jsonb("report").$type<Record<string, unknown> | null>(),
  },
  (t) => [index("dsar_org_status_idx").on(t.organizationId, t.status)],
);

export const deletionJobStatusEnum = pgEnum("deletion_job_status", ["pending", "running", "done", "failed", "not_applicable"]);

export const deletionJobs = pgTable(
  "deletion_jobs",
  {
    id: id(),
    organizationId: orgRef(),
    dsarId: uuid("dsar_id")
      .notNull()
      .references(() => dataSubjectRequests.id, { onDelete: "cascade" }),
    store: text("store").notNull(),
    status: deletionJobStatusEnum("status").notNull().default("pending"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    startedAt: tz("started_at"),
    finishedAt: tz("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [index("deletion_jobs_dsar_idx").on(t.dsarId), index("deletion_jobs_org_idx").on(t.organizationId)],
);
