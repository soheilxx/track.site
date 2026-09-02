import { createHmac, randomBytes } from "node:crypto";

/** RFC 5849 OAuth 1.0a HMAC-SHA1 request signing (used by the X Ads API). JSON bodies are not part of the signature base. */
export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}

function enc(v: string): string {
  return encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function oauth1Header(method: string, url: string, creds: OAuth1Credentials, now: () => Date = () => new Date(), nonce: string = randomBytes(16).toString("hex")): string {
  const u = new URL(url);
  const base = `${u.protocol}//${u.host}${u.pathname}`;
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(now().getTime() / 1000)),
    oauth_token: creds.token,
    oauth_version: "1.0",
  };
  const params: Array<[string, string]> = Object.entries(oauth).map(([k, v]) => [enc(k), enc(v)]);
  u.searchParams.forEach((v, k) => params.push([enc(k), enc(v)]));
  params.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const paramString = params.map(([k, v]) => `${k}=${v}`).join("&");
  const baseString = `${method.toUpperCase()}&${enc(base)}&${enc(paramString)}`;
  const key = `${enc(creds.consumerSecret)}&${enc(creds.tokenSecret)}`;
  const signature = createHmac("sha1", key).update(baseString).digest("base64");
  const header = { ...oauth, oauth_signature: signature };
  return `OAuth ${Object.entries(header)
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
    .join(", ")}`;
}
