import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge, Card, Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { Link } from "@/i18n/navigation";
import { listCategories, listPosts } from "@/lib/blog";
import { pick } from "@/lib/marketing-copy";
import { absoluteUrl, alternatesFor, breadcrumbJsonLd } from "@/lib/seo";

const COPY = {
  en: { title: "Blog", intro: "Practical guides on server-side tracking, consent, deduplication, attribution and the individual advertising platforms — written by the team that builds the connectors.", all: "All topics", minutes: "{n} min read", rss: "RSS feed", empty: "No articles published yet." },
  de: { title: "Blog", intro: "Praxisnahe Anleitungen zu serverseitigem Tracking, Consent, Deduplizierung, Attribution und den einzelnen Werbeplattformen — geschrieben vom Team, das die Connectoren baut.", all: "Alle Themen", minutes: "{n} Min. Lesezeit", rss: "RSS-Feed", empty: "Noch keine Artikel veröffentlicht." },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return { title: c.title, description: c.intro, alternates: { ...alternatesFor("/blog", locale), types: { "application/rss+xml": absoluteUrl("/blog/feed.xml", locale) } } };
}

export default async function BlogIndex({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ category?: string }> }) {
  const { locale } = await params;
  const { category } = await searchParams;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  const [posts, categories] = await Promise.all([listPosts(locale), listCategories(locale)]);
  const visible = category ? posts.filter((p) => p.category === category) : posts;
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: c.title, path: "/blog" }], locale), { "@context": "https://schema.org", "@type": "Blog", name: `track.site ${c.title}`, url: absoluteUrl("/blog", locale), inLanguage: locale }]} />
      <Container className="py-14 md:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">{c.intro}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          <Link href="/blog" className={`rounded-full px-3 py-1 ${!category ? "bg-primary-soft text-primary" : "bg-surface-2 text-ink-3"}`}>
            {c.all}
          </Link>
          {categories.map((cat) => (
            <Link key={cat.category} href={`/blog?category=${cat.category}`} className={`rounded-full px-3 py-1 ${category === cat.category ? "bg-primary-soft text-primary" : "bg-surface-2 text-ink-3"}`}>
              {cat.category} ({cat.count})
            </Link>
          ))}
          <a href={`/blog/feed.xml`} className="ml-auto text-xs text-ink-3 hover:text-ink">
            {c.rss}
          </a>
        </div>
        {visible.length === 0 ? (
          <p className="mt-10 text-sm text-ink-3">{c.empty}</p>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <li key={p.slug}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-2 text-xs text-ink-3">
                    <Badge tone="neutral">{p.category}</Badge>
                    <time dateTime={p.publishedAt}>{new Date(p.publishedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB")}</time>
                    <span>· {c.minutes.replace("{n}", String(p.readingMinutes))}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-ink">
                    <Link href={`/blog/${p.slug}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm text-ink-2">{p.excerpt}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
