import { useTranslations } from "next-intl";
import { Container, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">{t("title")}</h1>
      <p className="mt-2 text-ink-2">{t("text")}</p>
      {/* button-styled link: interactive elements are never nested */}
      <Link href="/" className={cn(buttonVariants(), "mt-6")}>
        {t("home")}
      </Link>
    </Container>
  );
}
