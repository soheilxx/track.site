"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setActiveSiteAction } from "@/components/app/shell/actions";
import { INSIGHTS_AUDIENCES_PATH } from "./insights-legacy";

/**
 * Legacy `?site=` links (old `/app/audiences`, carried over by the 308 shim): make that site the
 * active workspace of the current user — permission check, validation and audit live in the shell's
 * `setActiveSiteAction` — then open the audiences of that workspace. Nothing else is switched.
 */
export async function switchToSiteAndOpenAudiencesAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ siteId: z.string().uuid() })
    .safeParse({ siteId: formData.get("siteId") });
  if (parsed.success) await setActiveSiteAction({ siteId: parsed.data.siteId });
  redirect(INSIGHTS_AUDIENCES_PATH);
}
