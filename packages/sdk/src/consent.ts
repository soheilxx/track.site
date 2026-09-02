import type { BundleView, ConsentState, Purpose } from "./types.ts";

type Listener = (state: ConsentState, previous: ConsentState) => void;

const ALL: Purpose[] = ["necessary", "analytics", "marketing", "personalization"];

export function defaultConsent(gpc: boolean | null): ConsentState {
  return { granted: ["necessary"], source: "default", policy_version: null, ts: null, region: null, gpc };
}

/** Normalizes any input shape into a ConsentState; unknown purposes are ignored. */
export function normalizeConsent(input: unknown, source: string, policyVersion: string | null, gpc: boolean | null): ConsentState | null {
  let granted: Purpose[] | null = null;
  if (Array.isArray(input)) granted = input.filter((p): p is Purpose => ALL.indexOf(p as Purpose) !== -1);
  else if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    if (Array.isArray(o.granted)) granted = (o.granted as unknown[]).filter((p): p is Purpose => ALL.indexOf(p as Purpose) !== -1);
    else granted = ALL.filter((p) => p === "necessary" || o[p] === true);
  } else if (input === "all") granted = ALL.slice();
  else if (input === "none") granted = ["necessary"];
  if (!granted) return null;
  if (granted.indexOf("necessary") === -1) granted.unshift("necessary");
  return { granted, source, policy_version: policyVersion, ts: Date.now(), region: null, gpc };
}

export function has(state: ConsentState, purpose: Purpose): boolean {
  if (purpose === "necessary") return true;
  if (state.gpc && (purpose === "marketing" || purpose === "personalization")) return false;
  return state.granted.indexOf(purpose) !== -1;
}

export function readGpc(): boolean | null {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return typeof nav.globalPrivacyControl === "boolean" ? nav.globalPrivacyControl : null;
}

/** Google Consent Mode v2 flags derived from purposes (never guessed). */
export function consentModeFlags(state: ConsentState): Record<string, "granted" | "denied"> {
  const g = (p: Purpose) => (has(state, p) ? "granted" : "denied");
  return {
    ad_storage: g("marketing"),
    analytics_storage: g("analytics"),
    ad_user_data: g("marketing"),
    ad_personalization: has(state, "marketing") && has(state, "personalization") ? "granted" : "denied",
    functionality_storage: "granted",
    personalization_storage: g("personalization"),
    security_storage: "granted",
  };
}

export class ConsentManager {
  state: ConsentState;
  private readonly listeners: Listener[] = [];
  private detached: Array<() => void> = [];

  constructor(
    private readonly bundle: BundleView["consent"],
    gpc: boolean | null,
  ) {
    this.state = defaultConsent(bundle.respect_gpc ? gpc : null);
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  set(next: ConsentState): void {
    const prev = this.state;
    this.state = next;
    for (const l of this.listeners) {
      try {
        l(next, prev);
      } catch {
        /* isolated */
      }
    }
  }

  setFrom(input: unknown, source: string): boolean {
    const n = normalizeConsent(input, source, this.bundle.policy_version, this.state.gpc);
    if (!n) return false;
    this.set(n);
    return true;
  }

  /** Attach the configured CMP adapter. Every adapter is optional and failure-isolated. */
  attach(): void {
    const provider = this.bundle.cmp.provider;
    const w = window as unknown as Record<string, unknown>;
    try {
      if (provider === "tcf") this.attachTcf(w);
      else if (provider === "cookiebot") this.attachCookiebot(w);
      else if (provider === "onetrust") this.attachOneTrust(w);
      else if (provider === "usercentrics") this.attachUsercentrics(w);
      else if (provider === "gpp") this.attachGpp(w);
    } catch {
      /* CMP not present yet: the API path still works */
    }
  }

  detach(): void {
    for (const d of this.detached) d();
    this.detached = [];
  }

  private attachTcf(w: Record<string, unknown>): void {
    const api = w.__tcfapi as ((cmd: string, v: number, cb: (d: TcData, ok: boolean) => void) => void) | undefined;
    if (!api) return;
    const handler = (d: TcData, ok: boolean) => {
      if (!ok || !d || (d.eventStatus !== "tcloaded" && d.eventStatus !== "useractioncomplete")) return;
      const p = d.purpose?.consents ?? {};
      const granted: Purpose[] = ["necessary"];
      // TCF purposes: 1 storage, 2-4 ads, 5-6 personalised content, 7-10 measurement. Conservative mapping.
      if (p[1] && p[7] && p[8]) granted.push("analytics");
      if (p[1] && p[2] && p[3] && p[4]) granted.push("marketing");
      if (p[1] && p[5] && p[6]) granted.push("personalization");
      this.set({ granted, source: "tcf", policy_version: this.bundle.policy_version, ts: Date.now(), region: null, gpc: this.state.gpc });
    };
    api("addEventListener", 2, handler);
  }

  private attachGpp(w: Record<string, unknown>): void {
    const api = w.__gpp as ((cmd: string, cb: (d: { gpcSignal?: boolean } | null) => void) => void) | undefined;
    if (!api) return;
    api("ping", (d) => {
      if (d && typeof d.gpcSignal === "boolean" && d.gpcSignal) this.set({ ...this.state, gpc: true, source: "gpp" });
    });
  }

  private attachCookiebot(w: Record<string, unknown>): void {
    const read = () => {
      const cb = w.Cookiebot as { consent?: { statistics?: boolean; marketing?: boolean; preferences?: boolean } } | undefined;
      if (!cb?.consent) return;
      const granted: Purpose[] = ["necessary"];
      if (cb.consent.statistics) granted.push("analytics");
      if (cb.consent.marketing) granted.push("marketing");
      if (cb.consent.preferences) granted.push("personalization");
      this.set({ granted, source: "cmp:cookiebot", policy_version: this.bundle.policy_version, ts: Date.now(), region: null, gpc: this.state.gpc });
    };
    for (const ev of ["CookiebotOnConsentReady", "CookiebotOnAccept", "CookiebotOnDecline"]) {
      window.addEventListener(ev, read);
      this.detached.push(() => window.removeEventListener(ev, read));
    }
    read();
  }

  private attachOneTrust(w: Record<string, unknown>): void {
    const read = () => {
      const groups = String(w.OnetrustActiveGroups ?? "");
      if (!groups) return;
      const granted: Purpose[] = ["necessary"];
      if (groups.indexOf("C0002") !== -1) granted.push("analytics");
      if (groups.indexOf("C0004") !== -1) granted.push("marketing");
      if (groups.indexOf("C0003") !== -1) granted.push("personalization");
      this.set({ granted, source: "cmp:onetrust", policy_version: this.bundle.policy_version, ts: Date.now(), region: null, gpc: this.state.gpc });
    };
    window.addEventListener("OneTrustGroupsUpdated", read);
    this.detached.push(() => window.removeEventListener("OneTrustGroupsUpdated", read));
    read();
  }

  private attachUsercentrics(w: Record<string, unknown>): void {
    const s = this.bundle.cmp.settings;
    const analyticsService = String(s.analyticsService ?? "Google Analytics");
    const marketingService = String(s.marketingService ?? "Facebook Pixel");
    const read = () => {
      const ui = w.UC_UI as { getServicesBaseInfo?: () => Array<{ name: string; consent: { status: boolean } }> } | undefined;
      const services = ui?.getServicesBaseInfo?.();
      if (!services) return;
      const on = (name: string) => services.some((x) => x.name === name && x.consent.status);
      const granted: Purpose[] = ["necessary"];
      if (on(analyticsService)) granted.push("analytics");
      if (on(marketingService)) granted.push("marketing");
      this.set({ granted, source: "cmp:usercentrics", policy_version: this.bundle.policy_version, ts: Date.now(), region: null, gpc: this.state.gpc });
    };
    for (const ev of ["UC_UI_INITIALIZED", "UC_UI_CMP_EVENT", "ucEvent"]) {
      window.addEventListener(ev, read);
      this.detached.push(() => window.removeEventListener(ev, read));
    }
    read();
  }
}

interface TcData {
  eventStatus?: string;
  purpose?: { consents?: Record<number, boolean> };
}
