import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, Input, Label, Select, buttonVariants } from "@track-site/ui";
import { DIRECTORY_PATH, USER_SORTS, type UserFilters } from "@/server/ops/users";

/** GET form (works without JavaScript): search, account kind, two-factor, sort and direction live in the URL. */
export async function DirectoryFilters({ filters }: { filters: UserFilters }) {
  const t = await getTranslations("opsUsers.directory.filters");
  return (
    <form method="get" action={DIRECTORY_PATH} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <legend className="mb-3 text-sm font-semibold text-ink">{t("legend")}</legend>
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="user-q">{t("search")}</Label>
          <Input id="user-q" type="search" name="q" defaultValue={filters.q ?? ""} maxLength={64} placeholder={t("searchPlaceholder")} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="user-kind">{t("kind")}</Label>
          <Select id="user-kind" name="kind" defaultValue={filters.kind === "all" ? "" : filters.kind} className="mt-1.5">
            <option value="">{t("kinds.all")}</option>
            <option value="operators">{t("kinds.operators")}</option>
            <option value="customers">{t("kinds.customers")}</option>
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="user-2fa">{t("twoFactor")}</Label>
          <Select id="user-2fa" name="twoFactor" defaultValue={filters.twoFactor === "all" ? "" : filters.twoFactor} className="mt-1.5">
            <option value="">{t("twoFactorAll")}</option>
            <option value="on">{t("twoFactorOn")}</option>
            <option value="off">{t("twoFactorOff")}</option>
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="user-sort">{t("sort")}</Label>
          <Select id="user-sort" name="sort" defaultValue={filters.sort} className="mt-1.5">
            {USER_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sorts.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="user-dir">{t("direction")}</Label>
          <Select id="user-dir" name="dir" defaultValue={filters.dir} className="mt-1.5">
            <option value="desc">{t("desc")}</option>
            <option value="asc">{t("asc")}</option>
          </Select>
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary">
          {t("apply")}
        </Button>
        <Link href={DIRECTORY_PATH} className={buttonVariants({ variant: "ghost" })}>
          {t("reset")}
        </Link>
      </div>
    </form>
  );
}
