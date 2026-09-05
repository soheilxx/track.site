import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { siteBelongsToOrg } from "@/server/ai/context";
import { getOrgContext } from "@/server/session";
import { FIXTURES, devFixturesEnabled, fixtureMessages } from "./fixtures";

export const dynamic = "force-dynamic";

/**
 * Development-only synthetic transcripts for the Track AI panel (e2e: the 250-message viewport
 * test). The store requests a fixture through `?ai_fixture=<name>` on the dashboard URL and falls
 * back to the real conversation whenever this route answers anything but 200. The route is dead
 * in production (`APP_ENV=production` always; a production build answers only with the explicit
 * `AI_DEV_FIXTURES=1` of the e2e server, see `devFixturesEnabled`), requires a signed-in member
 * of the site's organization, persists nothing and contains no customer data.
 */
const query = z.object({ siteId: z.string().uuid(), fixture: z.enum(FIXTURES), count: z.coerce.number().int().min(1).max(1_000).default(250) });

export async function GET(req: NextRequest) {
  if (!devFixturesEnabled()) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR" }, { status: 400 });
  if (!(await siteBelongsToOrg(ctx.organization.id, parsed.data.siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, fixture: parsed.data.fixture, messages: fixtureMessages(parsed.data.count) }, { headers: { "cache-control": "no-store" } });
}
