import { describe, expect, it } from "vitest";
import { randomBase64Url } from "@track-site/core";
import { getConnector } from "@track-site/connectors";
import { redactToolOutput } from "../dlp.ts";
import { SKIPPABLE_STEPS, compareConfigVersions, createIntegrationDraftTool, createTriggerDraft, destinationReadiness, proposeEventPlan, requiredPublicIdKeys, resolveIntegrationMode, savePublicPixelIdDraft, setBusinessProfileDraft, setConsentPolicyDraft, skipSetupStep, upsertEventMappingDraft } from "./draft.ts";

const uuid = "0b8a1d2c-3e4f-4a5b-9c6d-7e8f90a1b2c3";
const props = (tool: { jsonSchema: Record<string, unknown> }) => tool.jsonSchema.properties as Record<string, Record<string, unknown>>;
/** strict schemas express "nullable" as a type array or an anyOf with exactly one null branch */
const nullable = (p: Record<string, unknown>) => (Array.isArray(p.type) ? p.type.includes("null") : Array.isArray(p.anyOf) && (p.anyOf as Array<{ type?: string }>).filter((x) => x.type === "null").length === 1);

describe("skip_setup_step", () => {
  it("only accepts skippable steps and names them in the description", () => {
    expect(SKIPPABLE_STEPS.options).not.toContain("site");
    expect(SKIPPABLE_STEPS.options).not.toContain("publish");
    expect(SKIPPABLE_STEPS.options).toContain("installation");
    expect(skipSetupStep.validate({ step: "site", reason: "x" }).ok).toBe(false);
    expect(skipSetupStep.validate({ step: "publish", reason: "x" }).ok).toBe(false);
    expect(skipSetupStep.validate({ step: "destinations", reason: "x" }).ok).toBe(true);
    expect(skipSetupStep.description).toContain("site and publish cannot be skipped");
    expect((props(skipSetupStep).step!.enum as string[]).includes("site")).toBe(false);
  });
});

describe("field descriptions the model needs", () => {
  it("explains where integration ids and event names come from", () => {
    for (const tool of [savePublicPixelIdDraft, upsertEventMappingDraft]) {
      expect(String(props(tool).integration_id!.description)).toContain("id=");
    }
    expect(String(props(upsertEventMappingDraft).event!.description)).toContain("snake_case");
    expect(String(props(createTriggerDraft).event_name!.description)).toContain("inspect_event_schema");
    expect(String(props(savePublicPixelIdDraft).key!.description)).toContain("required_public_ids");
    expect(String(props(createIntegrationDraftTool).mode!.description)).toContain("null = best mode");
    expect(String(props(proposeEventPlan).include_events!.description)).toContain("create_trigger_draft");
    expect(String(props(proposeEventPlan).authoritative_purchase_source!.description)).toContain("connected shop integration");
    expect(String(props(setBusinessProfileDraft).platform!.description)).toContain("does not complete the step");
    expect(String(props(compareConfigVersions).to_version!.description)).toContain("open draft");
  });
  it("makes vendor_event optional (connector default) and keeps the strict schema shape", () => {
    expect(upsertEventMappingDraft.validate({ integration_id: uuid, event: "Purchase", vendor_event: null, enabled: true, enable_destination: null }).ok).toBe(true);
    expect(upsertEventMappingDraft.validate({ integration_id: uuid, event: "purchase", vendor_event: "", enabled: true, enable_destination: true }).ok).toBe(true);
    expect(upsertEventMappingDraft.validate({ integration_id: "meta", event: "purchase", vendor_event: null, enabled: true, enable_destination: null }).ok).toBe(false);
    const schema = upsertEventMappingDraft.jsonSchema;
    expect((schema.required as string[]).sort()).toEqual(Object.keys(schema.properties as object).sort());
    expect(nullable(props(upsertEventMappingDraft).vendor_event!)).toBe(true);
  });
  it("adds cmp_provider other with an optional cmp_name and stays compatible with callers that omit cmp_name", () => {
    expect(setConsentPolicyDraft.validate({ cmp_provider: "other", cmp_name: "Borlabs Cookie", consent_mode: "basic", legal_review_note: null, markets: null }).ok).toBe(true);
    expect(setConsentPolicyDraft.validate({ cmp_provider: "usercentrics", consent_mode: "basic", legal_review_note: null, markets: null }).ok).toBe(true);
    expect(setConsentPolicyDraft.validate({ cmp_provider: "consentmanager", cmp_name: null, consent_mode: "basic", legal_review_note: null, markets: null }).ok).toBe(false);
    expect(nullable(props(setConsentPolicyDraft).cmp_name!)).toBe(true);
    expect((setConsentPolicyDraft.jsonSchema.required as string[])).toContain("cmp_name");
    expect(setConsentPolicyDraft.description).toContain("other = a CMP without built-in adapter");
  });
});

describe("verify_domain output", () => {
  it("keeps the published verification token intact through the tool-output redactor", () => {
    for (let i = 0; i < 50; i++) {
      const token = `track-site-verify=${randomBase64Url(24)}`;
      const result = { hostname: "shop.test", verified: false, instructions: { dns_txt: { host: "_track-site.shop.test", value: token }, file: { url: "https://shop.test/.well-known/track-site-verify.txt", content: token }, meta_tag: `<meta name="track-site-verification" content="${token}">` } };
      expect(redactToolOutput(result)).toEqual(result);
    }
  });
});

describe("resolveIntegrationMode", () => {
  it("defaults to the best supported mode and rejects unsupported modes with the alternative", () => {
    const webhook = getConnector("webhook")!.meta;
    const meta = getConnector("meta")!.meta;
    expect(resolveIntegrationMode(webhook, null)).toBe("server");
    expect(resolveIntegrationMode(meta, null)).toBe("hybrid");
    expect(resolveIntegrationMode(meta, "browser")).toBe("browser");
    expect(() => resolveIntegrationMode(webhook, "browser")).toThrow(/no browser tag.*"server"/);
    expect(() => resolveIntegrationMode(webhook, "hybrid")).toThrow(/supports only server/);
    expect(() => resolveIntegrationMode({ type: "meta", supportsBrowser: true, supportsServer: false }, "server")).toThrow(/no server path/);
  });
});

describe("destination readiness", () => {
  it("treats optional public ids as optional and requires active credentials of every required kind", () => {
    const meta = getConnector("meta")!.meta;
    expect(requiredPublicIdKeys(meta)).toEqual(["pixel_id"]);
    expect(requiredPublicIdKeys({ requiredPublicIds: [{ key: "opt", label: "o", pattern: "^[0-9]*?$", example: "", help: "" }, { key: "opt2", label: "o", pattern: "^[a-z]{0,4}$", example: "", help: "" }, { key: "req", label: "r", pattern: "^[0-9]+$", example: "1", help: "" }] })).toEqual(["req"]);
    const base = { id: "i1", name: "Meta", connectorType: "meta", meta, credentialRefs: [] as Array<{ kind: string; status: string }> };
    expect(destinationReadiness({ ...base, publicConfig: {} })).toMatchObject({ ready: false, missing_public_ids: ["pixel_id"], missing_credentials: ["access_token"] });
    expect(destinationReadiness({ ...base, publicConfig: { pixel_id: "123456789012345" }, credentialRefs: [{ kind: "access_token", status: "revoked" }] })).toMatchObject({ ready: false, missing_public_ids: [], missing_credentials: ["access_token"] });
    expect(destinationReadiness({ ...base, publicConfig: { pixel_id: "123456789012345" }, credentialRefs: [{ kind: "access_token", status: "active" }] })).toMatchObject({ ready: true, missing_public_ids: [], missing_credentials: [] });
    expect(destinationReadiness({ ...base, connectorType: "nope", meta: null, publicConfig: {} }).ready).toBe(false);
    const optionalOnly = { requiredPublicIds: [{ key: "preset", label: "Network", pattern: "^(awin|cj)$", example: "awin", help: "" }], requiredCredentials: [{ kind: "access_token" as const, label: "t", help: "", secret: true as const, oauth: null, optional: true }] };
    expect(destinationReadiness({ id: "i2", name: "Awin", connectorType: "affiliate", meta: optionalOnly, publicConfig: { preset: "awin" }, credentialRefs: [] })).toMatchObject({ ready: true, missing_credentials: [] });
    expect(destinationReadiness({ id: "i2", name: "Awin", connectorType: "affiliate", meta: optionalOnly, publicConfig: {}, credentialRefs: [] })).toMatchObject({ ready: false, missing_public_ids: ["preset"] });
  });
});
