import { z } from "zod";
import { setupStepSchema, type SetupStep } from "./ui-schema.ts";

/**
 * Deterministic, resumable setup state machine. The canonical state lives in
 * `site_setup_states` (database), never in the model's memory. Every turn reads it first.
 */
export const SETUP_STEPS: SetupStep[] = ["site", "business_type", "platform", "installation", "consent", "destinations", "event_plan", "test", "review", "publish", "health"];
export const SETUP_STATE_VERSION = 1;

export const stepStateSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "skipped", "blocked"]),
  fields: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(z.object({ source: z.string(), detail: z.string(), at: z.string() })).default([]),
  confidence: z.number().min(0).max(1).nullable().default(null),
  blockers: z.array(z.string()).default([]),
  completedAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});
export type StepState = z.infer<typeof stepStateSchema>;

export const setupStateSchema = z.object({
  version: z.number().int(),
  currentStep: setupStepSchema,
  steps: z.record(setupStepSchema, stepStateSchema),
  context: z.object({
    domain: z.string().nullable().default(null),
    businessType: z.string().nullable().default(null),
    platform: z.string().nullable().default(null),
    cmp: z.string().nullable().default(null),
    markets: z.array(z.string()).default([]),
    locale: z.string().default("en"),
    draftId: z.string().nullable().default(null),
    lastPublishedVersion: z.number().int().nullable().default(null),
  }),
});
export type SetupState = z.infer<typeof setupStateSchema>;

export function initialSetupState(input: { domain: string | null; locale: string }): SetupState {
  const steps = Object.fromEntries(SETUP_STEPS.map((s) => [s, stepStateSchema.parse({ status: s === "site" ? "completed" : "pending", completedAt: s === "site" ? new Date().toISOString() : null })])) as Record<SetupStep, StepState>;
  return {
    version: SETUP_STATE_VERSION,
    currentStep: "business_type",
    steps,
    context: { domain: input.domain, businessType: null, platform: null, cmp: null, markets: [], locale: input.locale, draftId: null, lastPublishedVersion: null },
  };
}

/** Required fields per step; a step is complete when all are present in `fields`. */
export const STEP_REQUIREMENTS: Record<SetupStep, string[]> = {
  site: ["domain"],
  business_type: ["business_type"],
  platform: ["platform"],
  installation: ["snippet_verified"],
  consent: ["cmp", "policy_version"],
  destinations: ["destination_ids"],
  event_plan: ["events"],
  test: ["test_passed"],
  review: ["reviewed"],
  publish: ["published_version"],
  health: [],
};

/** Tools allowed per step (read-only tools are always allowed). */
export const STEP_TOOLS: Record<SetupStep, string[]> = {
  site: ["inspect_site", "detect_site_stack", "set_business_profile_draft"],
  business_type: ["inspect_site", "detect_site_stack", "set_business_profile_draft"],
  platform: ["inspect_site", "detect_site_stack", "set_business_profile_draft", "create_integration_draft"],
  installation: ["verify_snippet_installation", "verify_domain", "create_integration_draft"],
  consent: ["explain_consent_state", "set_consent_policy_draft"],
  destinations: ["create_integration_draft", "save_public_pixel_id_draft", "request_secure_credential_input", "upsert_event_mapping_draft", "activate_or_pause_destination", "rotate_credential", "disconnect_integration"],
  event_plan: ["propose_event_plan", "create_trigger_draft", "upsert_event_mapping_draft"],
  test: ["run_test_event", "run_diagnostics", "validate_draft", "verify_snippet_installation"],
  review: ["validate_draft", "prepare_publish", "compare_config_versions"],
  publish: ["prepare_publish", "publish_config_version", "rollback_config_version"],
  health: ["run_diagnostics", "analyze_recent_event_health", "show_delivery_errors", "rollback_config_version", "activate_or_pause_destination"],
};

export const READ_ONLY_TOOLS = ["get_workspace_state", "get_setup_state", "inspect_site", "detect_site_stack", "list_integrations", "inspect_event_schema", "analyze_recent_event_health", "show_delivery_errors", "explain_consent_state"];
export const CONFIRM_TOOLS = ["publish_config_version", "rollback_config_version", "activate_or_pause_destination", "rotate_credential", "disconnect_integration", "send_live_conversion", "delete_or_export_data"];

export function progressPercent(state: SetupState): number {
  const done = SETUP_STEPS.filter((s) => state.steps[s]?.status === "completed" || state.steps[s]?.status === "skipped").length;
  return Math.round((done / (SETUP_STEPS.length - 1)) * 100);
}

export function completedSteps(state: SetupState): SetupStep[] {
  return SETUP_STEPS.filter((s) => state.steps[s]?.status === "completed" || state.steps[s]?.status === "skipped");
}

export function missingFields(state: SetupState, step: SetupStep = state.currentStep): string[] {
  const fields = state.steps[step]?.fields ?? {};
  return STEP_REQUIREMENTS[step].filter((f) => fields[f] === undefined || fields[f] === null || fields[f] === false);
}

/** Records evidence/fields for a step; marks it completed when requirements are met and advances. */
export function applyStepUpdate(state: SetupState, step: SetupStep, update: { fields?: Record<string, unknown>; evidence?: { source: string; detail: string }; confidence?: number | null; blockers?: string[]; complete?: boolean }, now = new Date()): SetupState {
  const next = structuredClone(state);
  const s = next.steps[step] ?? stepStateSchema.parse({ status: "pending" });
  s.fields = { ...s.fields, ...(update.fields ?? {}) };
  if (update.evidence) s.evidence = [...s.evidence, { ...update.evidence, at: now.toISOString() }].slice(-10);
  if (update.confidence !== undefined) s.confidence = update.confidence;
  if (update.blockers) s.blockers = update.blockers;
  s.updatedAt = now.toISOString();
  const satisfied = STEP_REQUIREMENTS[step].every((f) => s.fields[f] !== undefined && s.fields[f] !== null && s.fields[f] !== false);
  if ((update.complete ?? satisfied) && s.blockers.length === 0) {
    s.status = "completed";
    s.completedAt = s.completedAt ?? now.toISOString();
  } else if (s.blockers.length) s.status = "blocked";
  else s.status = "in_progress";
  next.steps[step] = s;
  if (s.status === "completed" && next.currentStep === step) next.currentStep = nextStep(next) ?? step;
  return next;
}

export function nextStep(state: SetupState): SetupStep | null {
  for (const s of SETUP_STEPS) {
    const st = state.steps[s]?.status;
    if (st !== "completed" && st !== "skipped") return s;
  }
  return null;
}

export function skipStep(state: SetupState, step: SetupStep, now = new Date()): SetupState {
  const next = structuredClone(state);
  const s = next.steps[step] ?? stepStateSchema.parse({ status: "pending" });
  s.status = "skipped";
  s.updatedAt = now.toISOString();
  next.steps[step] = s;
  if (next.currentStep === step) next.currentStep = nextStep(next) ?? step;
  return next;
}

export function goToStep(state: SetupState, step: SetupStep): SetupState {
  const next = structuredClone(state);
  next.currentStep = step;
  const s = next.steps[step];
  if (s && s.status === "completed") s.status = "in_progress";
  return next;
}

export function allowedToolNames(state: SetupState, role: string): string[] {
  const writeAllowed = ["OWNER", "ADMIN", "DEVELOPER"].includes(role);
  const stepTools = STEP_TOOLS[state.currentStep] ?? [];
  const always = ["get_workspace_state", "get_setup_state", "list_integrations", "inspect_event_schema", "explain_consent_state", "analyze_recent_event_health", "show_delivery_errors", "run_diagnostics", "set_setup_step", "skip_setup_step"];
  const names = new Set([...always, ...stepTools]);
  if (!writeAllowed) return Array.from(names).filter((n) => READ_ONLY_TOOLS.includes(n) || n === "run_diagnostics");
  return Array.from(names);
}
