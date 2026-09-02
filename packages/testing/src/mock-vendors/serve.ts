import { startMockVendorServer } from "./index.ts";

/** `pnpm --filter @track-site/testing mock:vendors` starts the mock vendors on :3200 (set VENDOR_MOCK_BASE_URL=http://127.0.0.1:3200). */
const port = Number(process.env.MOCK_VENDOR_PORT ?? 3200);
const s = await startMockVendorServer(
  {
    metaToken: process.env.MOCK_META_TOKEN,
    tiktokToken: process.env.MOCK_TIKTOK_TOKEN,
    redditToken: process.env.MOCK_REDDIT_TOKEN,
    linkedinToken: process.env.MOCK_LINKEDIN_TOKEN,
    ga4Secret: process.env.MOCK_GA4_SECRET,
  },
  port,
);
console.error(`mock vendors listening on ${s.url} (records: ${s.url}/__records)`);
