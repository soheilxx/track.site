import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { containsSecret, isOpaqueIdentifier, luhn, redactDeep, redactPii, scanForPii } from "./detect.ts";

describe("pii detection", () => {
  it("finds emails, phones, ibans, cards and ips", () => {
    const text =
      "mail me at Jane.Doe@example.org or +49 151 123 4567, IBAN DE89 3704 0044 0532 0130 00, card 4111 1111 1111 1111, ip 192.168.1.10";
    const kinds = scanForPii(text).map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(["email", "phone", "iban", "card", "ipv4"]));
  });

  it("detects vendor secrets and generic tokens", () => {
    expect(containsSecret("here is my token EAABsbCS1iHgBAOZCZBZCZBZCZBZCZBZCZBZCZBZCZBZCZBZCZBZCZBZC")).toBe(true);
    expect(containsSecret("sk_live_51H8abcdefghijklmnop")).toBe(true);
    expect(containsSecret("api_key=abcdefghijklmnop1234567890")).toBe(true);
    expect(containsSecret("Bearer 7f9e2c4b1a0d8e6f5a3b2c1d0e9f8a7b6c5d4e3f")).toBe(true);
    expect(containsSecret("Our pixel id is 123456789012345 and the site is A7K2Q9")).toBe(false);
    expect(containsSecret("Please connect Meta and GA4 for my Shopify store")).toBe(false);
  });

  it("redacts findings with typed placeholders", () => {
    const { text, findings } = redactPii("contact a@b.co, card 4111111111111111");
    expect(text).toBe("contact [redacted:email], card [redacted:card]");
    expect(findings).toHaveLength(2);
    expect(redactDeep({ a: ["x@y.de"], b: { c: "ok" } })).toEqual({ a: ["[redacted:email]"], b: { c: "ok" } });
  });

  it("validates luhn", () => {
    expect(luhn("4111 1111 1111 1111")).toBe(true);
    expect(luhn("4111 1111 1111 1112")).toBe(false);
  });

  it("keeps opaque identifiers and public verification tokens out of the secret heuristic", () => {
    for (let i = 0; i < 1000; i++) {
      const id = randomUUID();
      expect(isOpaqueIdentifier(id)).toBe(true);
      expect(scanForPii(id)).toEqual([]);
      expect(redactPii(`{"integration_id":"${id}"}`).text).toBe(`{"integration_id":"${id}"}`);
    }
    expect(isOpaqueIdentifier("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
    expect(scanForPii("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toEqual([]);
    for (let i = 0; i < 200; i++) {
      const token = `track-site-verify=${randomBytes(24).toString("base64url")}`;
      const json = `{"dns_txt":{"host":"_track-site.shop.test","value":"${token}"}}`;
      expect(redactPii(json).text).toBe(json);
      expect(containsSecret(token)).toBe(false);
    }
    // the same random material without the public prefix is still treated as a secret
    expect(containsSecret("aB3dE5fG7hI9jK1lM2nO4pQ6rS8tU0vW")).toBe(true);
    expect(containsSecret("value=aB3dE5fG7hI9jK1lM2nO4pQ6rS8tU0vW")).toBe(true);
    expect(isOpaqueIdentifier("aB3dE5fG7hI9jK1lM2nO4pQ6rS8tU0vW")).toBe(false);
  });

  it("detects unprefixed base64 key material such as aws secret access keys", () => {
    for (let i = 0; i < 2000; i++) {
      const key = randomBytes(30).toString("base64");
      expect(containsSecret(key)).toBe(true);
      expect(redactPii(`{"aws_secret":"${key}"}`).text).toBe('{"aws_secret":"[redacted:secret]"}');
    }
    expect(containsSecret(`Secret access key: ${randomBytes(30).toString("base64")}`)).toBe(true);
    expect(containsSecret(randomBytes(32).toString("base64"))).toBe(true);
    expect(redactPii(`AKIAIOSFODNN7EXAMPLE:${randomBytes(30).toString("base64")}`).text).toBe("[redacted:secret]:[redacted:secret]");
    // published or structural values of similar length are not secrets
    for (let i = 0; i < 200; i++) {
      const sri = `sha384-${randomBytes(48).toString("base64")}`;
      expect(redactPii(`<script src="https://cdn.track.site/t.js" integrity="${sri}"></script>`).text).toContain(sri);
    }
    for (const benign of ["/api/v1/organizations/acme/integrations/meta_capi/settings/events", "purchase_value_currency_content_ids_content_type_num_items", randomUUID(), "01ARZ3NDEKTSV4RRFFQ69G5FAV", "https://shop.test/.well-known/track-site-verify.txt"]) {
      expect(containsSecret(benign)).toBe(false);
    }
    // bearer tokens may carry base64 characters early on; they are still one secret
    expect(redactPii("Authorization: Bearer ab1/CD+ef2ghIJ3klMN4opQR5stUV6wxYZ7 next").text).toBe("Authorization: [redacted:secret] next");
  });

  it("collapses overlapping findings into one placeholder without leaking a tail", () => {
    // a two-part token: the first part is matched by several detectors of different lengths
    const payload = `${randomBytes(30).toString("base64").replace(/[/+]/g, "A")}_${randomBytes(30).toString("base64url")}`;
    const signature = randomBytes(32).toString("base64url");
    const redacted = redactPii(`token ${payload}.${signature} end`).text;
    expect(redacted).not.toContain(payload.slice(-16));
    expect(redacted).not.toContain(signature.slice(0, 16));
    expect(redacted.startsWith("token [redacted:")).toBe(true);
    expect(redacted.endsWith(" end")).toBe(true);
  });
});
