import { describe, expect, it } from "vitest";
import { containsSecret, luhn, redactDeep, redactPii, scanForPii } from "./detect.ts";

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
});
