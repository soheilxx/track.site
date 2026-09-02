import { index, integer, jsonb, pgEnum, pgTable, real, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamps, tz } from "./_helpers.ts";
import { orgRef, sites } from "./tenancy.ts";

export const chatSessionStatusEnum = pgEnum("chat_session_status", ["active", "archived"]);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    status: chatSessionStatusEnum("status").notNull().default("active"),
    title: text("title"),
    locale: text("locale").notNull().default("en"),
    /** structured, redacted summary used as model context instead of the raw transcript */
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    model: text("model"),
    tokenUsage: jsonb("token_usage").$type<{ input: number; output: number; cached: number }>().notNull().default({ input: 0, output: 0, cached: 0 }),
    toolCalls: integer("tool_calls").notNull().default(0),
    lastMessageAt: tz("last_message_at"),
    ...timestamps(),
  },
  (t) => [index("chat_sessions_org_user_idx").on(t.organizationId, t.userId), index("chat_sessions_site_idx").on(t.siteId)],
);

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "tool", "system"]);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    organizationId: orgRef(),
    chatSessionId: uuid("chat_session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    /** envelope-encrypted, DLP-redacted text */
    contentEncrypted: text("content_encrypted").notNull(),
    contentDigest: text("content_digest").notNull(),
    /** final structured UI response (assistant turns) */
    ui: jsonb("ui").$type<Record<string, unknown> | null>(),
    redactionCount: integer("redaction_count").notNull().default(0),
    tokenUsage: jsonb("token_usage").$type<{ input: number; output: number; cached: number } | null>(),
    responseId: text("response_id"),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_session_idx").on(t.chatSessionId, t.createdAt), index("chat_messages_org_idx").on(t.organizationId)],
);

export const toolRunStatusEnum = pgEnum("tool_run_status", ["ok", "error", "denied", "needs_confirmation", "rate_limited"]);

export const agentToolRuns = pgTable(
  "agent_tool_runs",
  {
    id: id(),
    organizationId: orgRef(),
    chatSessionId: uuid("chat_session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    callId: text("call_id").notNull(),
    argsDigest: text("args_digest").notNull(),
    argsRedacted: jsonb("args_redacted").$type<Record<string, unknown>>().notNull(),
    resultCode: text("result_code").notNull(),
    resultRedacted: jsonb("result_redacted").$type<Record<string, unknown> | null>(),
    status: toolRunStatusEnum("status").notNull(),
    durationMs: integer("duration_ms"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_tool_runs_idempotency_uq").on(t.idempotencyKey), index("agent_tool_runs_session_idx").on(t.chatSessionId, t.createdAt), index("agent_tool_runs_org_idx").on(t.organizationId)],
);

export const approvalStatusEnum = pgEnum("approval_status", ["pending", "consumed", "expired", "revoked"]);

/** Short-lived, server-signed approvals binding action, target, tenant, actor and diff hash. */
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    organizationId: orgRef(),
    chatSessionId: uuid("chat_session_id").references(() => chatSessions.id, { onDelete: "set null" }),
    userId: uuid("user_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    diffHash: text("diff_hash").notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    tokenHash: text("token_hash").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    expiresAt: tz("expires_at").notNull(),
    consumedAt: tz("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("approvals_token_hash_uq").on(t.tokenHash), index("approvals_org_idx").on(t.organizationId)],
);

/** Canonical, resumable setup state per site (the model never owns state). */
export const siteSetupStates = pgTable(
  "site_setup_states",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    currentStep: text("current_step").notNull(),
    steps: jsonb("steps").$type<Record<string, unknown>>().notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    completedAt: tz("completed_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("site_setup_states_site_uq").on(t.siteId), index("site_setup_states_org_idx").on(t.organizationId)],
);

/** AI inferences are stored separately from observed facts and never overwrite them. */
export const inferences = pgTable(
  "inferences",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    field: text("field").notNull(),
    value: jsonb("value").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    confidence: real("confidence").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: createdAt(),
    expiresAt: tz("expires_at"),
    humanConfirmedAt: tz("human_confirmed_at"),
    humanRejectedAt: tz("human_rejected_at"),
  },
  (t) => [index("inferences_subject_idx").on(t.siteId, t.subjectType, t.subjectId, t.field), index("inferences_org_idx").on(t.organizationId)],
);
