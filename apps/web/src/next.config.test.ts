import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy, isSecureOrigin } from "../next.config";

/*
 * Security headers of next.config.ts (docs/16 D18): `upgrade-insecure-requests` is emitted only when the
 * configured public origin (HOST_MARKETING) is https — never for an http://localhost production build,
 * which WebKit would otherwise upgrade to https and fail to load. Every other directive is unchanged.
 */
const base = { production: true, ingest: "http://localhost:3100", cdn: "http://localhost:3000/cdn" };
const directives = (csp: string) => csp.split("; ");

describe("isSecureOrigin", () => {
  it("is true for https origins only", () => {
    expect(isSecureOrigin("https://track.site")).toBe(true);
    expect(isSecureOrigin("https://preview.track.site/")).toBe(true);
    expect(isSecureOrigin("http://localhost:3000")).toBe(false);
    expect(isSecureOrigin("http://localhost:3015")).toBe(false);
    expect(isSecureOrigin("http://track.site")).toBe(false);
    expect(isSecureOrigin(undefined)).toBe(false);
    expect(isSecureOrigin("")).toBe(false);
    expect(isSecureOrigin("not a url")).toBe(false);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("emits upgrade-insecure-requests for an https origin and omits it for http, keeping every other directive", () => {
    const secure = directives(buildContentSecurityPolicy({ ...base, secureOrigin: true }));
    const local = directives(buildContentSecurityPolicy({ ...base, secureOrigin: false }));
    expect(secure.at(-1)).toBe("upgrade-insecure-requests");
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(local).toEqual(secure.slice(0, -1));
    expect(local).toEqual([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' http://localhost:3100 http://localhost:3000 https://api.stripe.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]);
  });

  it("does not tie the directive to NODE_ENV: a development build on https gets it, a production build on http does not", () => {
    const devSecure = buildContentSecurityPolicy({ ...base, production: false, secureOrigin: true });
    expect(devSecure).toContain("upgrade-insecure-requests");
    expect(devSecure).toContain("'unsafe-eval'"); // the dev runtime still needs eval
    const prodLocal = buildContentSecurityPolicy({ ...base, production: true, secureOrigin: false });
    expect(prodLocal).not.toContain("upgrade-insecure-requests");
    expect(prodLocal).not.toContain("'unsafe-eval'");
  });

  it("derives connect-src origins from the ingest and cdn URLs and tolerates unparsable values", () => {
    const csp = buildContentSecurityPolicy({ production: true, secureOrigin: true, ingest: "https://ingest.track.site/v1", cdn: "nonsense" });
    expect(csp).toContain("connect-src 'self' https://ingest.track.site  https://api.stripe.com");
  });
});

describe("headers() of the exported config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function cspHeader(hostMarketing: string) {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOST_MARKETING", hostMarketing);
    vi.stubEnv("HOST_APP", `${hostMarketing}/app`);
    const config = (await import("../next.config")).default;
    const headers = await config.headers!();
    const site = headers.find((h) => h.source === "/(.*)")!;
    const csp = site.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    return { csp, keys: site.headers.map((h) => h.key) };
  }

  it("a production build for http://localhost carries no upgrade-insecure-requests; an https origin does", async () => {
    const local = await cspHeader("http://localhost:3015");
    expect(local.csp).not.toContain("upgrade-insecure-requests");
    expect(local.csp).toContain("default-src 'self'");
    expect(local.keys).toEqual(expect.arrayContaining(["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]));

    const secure = await cspHeader("https://track.site");
    expect(secure.csp).toContain("upgrade-insecure-requests");
    expect(secure.csp.split("; ").slice(0, -1)).toEqual(local.csp.split("; "));
  });
});
