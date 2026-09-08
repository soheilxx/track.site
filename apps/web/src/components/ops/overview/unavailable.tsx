import { getTranslations } from "next-intl/server";
import { Alert } from "@track-site/ui";

/** Honest state of an overview card whose module loader failed: no numbers, a pointer to the module. */
export async function Unavailable() {
  const t = await getTranslations("opsGrowth.overview");
  return <Alert tone="warn">{t("unavailable")}</Alert>;
}
