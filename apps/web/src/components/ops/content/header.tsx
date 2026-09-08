import { getTranslations } from "next-intl/server";
import { OpsPageHeader } from "@/components/ops/shell";
import { KNOWLEDGE_PATH } from "@/lib/knowledge-routes";
import { operatorLocale, publicHref } from "@/server/ops/content";
import { LiveLink } from "./live-link";
import type { ContentSection } from "./subnav";

/** Module header of every content page: the module title, the section intro, the read-only note and a link to the live hub. */
export async function ContentHeader({ section, intro, locale }: { section: ContentSection; intro: string; locale: string }) {
  const [t, tOps] = await Promise.all([getTranslations("opsContent"), getTranslations("ops.pages.content")]);
  const title = section === "board" ? tOps("title") : `${tOps("title")} · ${t(`sections.${section}`)}`;
  return (
    <OpsPageHeader
      title={title}
      intro={intro}
      context={<span>{t("common.readOnly")}</span>}
      actions={
        <LiveLink href={publicHref(operatorLocale(locale), KNOWLEDGE_PATH)} size="md">
          {t("common.openLive")}
        </LiveLink>
      }
    />
  );
}
