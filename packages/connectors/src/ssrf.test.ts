import { describe, expect, it } from "vitest";
import { classifyHttpStatus } from "./http.ts";
import { isPublicIp, validateDestinationUrl } from "./ssrf.ts";

describe("ssrf guard", () => {
  it("classifies addresses", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicIp(ip), ip).toBe(true);
  });

  it("rejects non-https, credentials, internal hosts and private literals", async () => {
    await expect(validateDestinationUrl("http://example.com/x")).rejects.toThrow(/https/);
    await expect(validateDestinationUrl("https://user:pw@example.com/x")).rejects.toThrow(/credentials/);
    await expect(validateDestinationUrl("https://localhost/x")).rejects.toThrow(/internal/);
    await expect(validateDestinationUrl("https://10.0.0.5/x")).rejects.toThrow(/non-public/);
    await expect(validateDestinationUrl("https://[::1]/x")).rejects.toThrow(/non-public/);
    await expect(validateDestinationUrl("https://example.com:8080/x")).rejects.toThrow(/port/);
    await expect(validateDestinationUrl("not a url")).rejects.toThrow(/invalid/);
    const ok = await validateDestinationUrl("https://8.8.8.8/hook");
    expect(ok.address).toBe("8.8.8.8");
    const local = await validateDestinationUrl("http://127.0.0.1:9999/hook", { allowPrivateNetwork: true, allowHttp: true });
    expect(local.address).toBe("127.0.0.1");
  });

  it("classifies http statuses", () => {
    expect(classifyHttpStatus(200)).toBe("none");
    expect(classifyHttpStatus(401)).toBe("auth");
    expect(classifyHttpStatus(429)).toBe("rate_limited");
    expect(classifyHttpStatus(503)).toBe("temporary");
    expect(classifyHttpStatus(400)).toBe("invalid_payload");
    expect(classifyHttpStatus(404)).toBe("permanent");
    expect(classifyHttpStatus(null, "timeout")).toBe("timeout");
  });
});
