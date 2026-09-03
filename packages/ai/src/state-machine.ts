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

/**
 * Required fields per step; a step is complete when all are present (and not false) in `fields`.
 * `destination_configured` is true once at least one destination has every required public id and
 * credential (see `syncDestinationsStep` in tools/draft.ts).
 */
export const STEP_REQUIREMENTS: Record<SetupStep, string[]> = {
  site: ["domain"],
  business_type: ["business_type"],
  platform: ["platform"],
  installation: ["snippet_verified"],
  consent: ["cmp", "policy_version"],
  destinations: ["destination_configured"],
  event_plan: ["events"],
  test: ["test_passed"],
  review: ["reviewed"],
  publish: ["published_version"],
  health: [],
};

/** Tools that create a destination need the tools that complete it (public ids, secure credential card) in the same step. */
const DESTINATION_SETUP_TOOLS = ["create_integration_draft", "save_public_pixel_id_draft", "request_secure_credential_input"];

/**
 * Tools allowed per step (read-only tools and the `always` list in `allowedToolNames` come on top).
 * Confirmation-gated actions (publish, rollback, pause/activate, credential rotation, disconnect)
 * are executed by the UI approval route, never by the model: only publish_config_version stays
 * listed so the approval route can resolve it; rollback, pause/activate, rotate and disconnect have
 * no approval issuer and are therefore not exposed to the model at all.
 */
export const STEP_TOOLS: Record<SetupStep, string[]> = {
  site: ["inspect_site", "detect_site_stack", "set_business_profile_draft"],
  business_type: ["inspect_site", "detect_site_stack", "set_business_profile_draft"],
  platform: ["inspect_site", "detect_site_stack", "set_business_profile_draft", ...DESTINATION_SETUP_TOOLS],
  installation: ["verify_snippet_installation", "verify_domain", ...DESTINATION_SETUP_TOOLS],
  consent: ["explain_consent_state", "set_consent_policy_draft"],
  destinations: [...DESTINATION_SETUP_TOOLS, "upsert_event_mapping_draft", "set_destination_settings_draft", "validate_integration_credentials", "get_destination_status", "send_destination_test_event", "validate_draft"],
  event_plan: ["propose_event_plan", "create_trigger_draft", "upsert_event_mapping_draft", "validate_draft"],
  test: ["run_test_event", "send_destination_test_event", "get_destination_status", "run_diagnostics", "validate_draft", "verify_snippet_installation"],
  review: ["validate_draft", "prepare_publish", "compare_config_versions"],
  publish: ["prepare_publish", "publish_config_version"],
  health: ["run_diagnostics", "analyze_recent_event_health", "show_delivery_errors", "get_destination_status", "validate_integration_credentials"],
};

export const READ_ONLY_TOOLS = ["get_workspace_state", "get_setup_state", "inspect_site", "detect_site_stack", "list_integrations", "get_destination_status", "inspect_event_schema", "analyze_recent_event_health", "show_delivery_errors", "explain_consent_state", "compare_config_versions"];
export const CONFIRM_TOOLS = ["publish_config_version", "rollback_config_version", "activate_or_pause_destination", "rotate_credential", "disconnect_integration", "send_live_conversion", "delete_or_export_data"];

/** Tools available in every step (write-role tools among them are filtered by role in `allowedToolNames`). */
export const ALWAYS_TOOLS = ["get_workspace_state", "get_setup_state", "list_integrations", "get_destination_status", "inspect_event_schema", "explain_consent_state", "analyze_recent_event_health", "show_delivery_errors", "compare_config_versions", "run_diagnostics", "set_setup_step", "skip_setup_step", "request_secure_credential_input"];

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
  if (s.status === "completed" && next.currentStep === step) next.currentStep = nextStep(next, step) ?? step;
  return next;
}

/**
 * First step that is neither completed nor skipped. With `after` the search starts behind that step so
 * completing a later step never jumps the setup back to an earlier open step (e.g. a destinations
 * step that is still waiting for credentials); the earlier steps are only revisited once everything
 * behind `after` is done.
 */
export function nextStep(state: SetupState, after?: SetupStep): SetupStep | null {
  const open = (s: SetupStep) => {
    const st = state.steps[s]?.status;
    return st !== "completed" && st !== "skipped";
  };
  const start = after ? SETUP_STEPS.indexOf(after) + 1 : 0;
  return SETUP_STEPS.slice(start).find(open) ?? SETUP_STEPS.slice(0, start).find(open) ?? null;
}

export function skipStep(state: SetupState, step: SetupStep, now = new Date()): SetupState {
  const next = structuredClone(state);
  const s = next.steps[step] ?? stepStateSchema.parse({ status: "pending" });
  s.status = "skipped";
  s.updatedAt = now.toISOString();
  next.steps[step] = s;
  if (next.currentStep === step) next.currentStep = nextStep(next, step) ?? step;
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
  const names = new Set([...ALWAYS_TOOLS, ...stepTools]);
  if (!writeAllowed) return Array.from(names).filter((n) => READ_ONLY_TOOLS.includes(n) || n === "run_diagnostics");
  return Array.from(names);
}
