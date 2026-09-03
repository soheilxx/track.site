import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { Badge, Card, Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { AUTHORS, getPost, listPosts, relatedPosts } from "@/lib/blog";
import { absoluteUrl, alternatesFor, breadcrumbJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateStaticParams() {
  const params: Array<{ locale: string; slug: string }> = [];
  for (const locale of routing.locales) for (const p of await listPosts(locale)) params.push({ locale, slug: p.slug });
  return params;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(locale, slug);
  if (!post || post.status === "draft") return {};
  return { title: seoTitle(post.title), description: seoDescription(post.description), alternates: alternatesFor(`/blog/${slug}`, locale), openGraph: { type: "article", publishedTime: post.publishedAt, modifiedTime: post.updatedAt ?? undefined, authors: [AUTHORS[post.author]?.name ?? post.author] } };
}

const LABELS = { en: { blog: "Blog", updated: "Updated", reviewed: "Reviewed", minutes: "min read", sources: "Sources", related: "Related articles", legal: "This article provides general information, not legal advice. Consult your data protection counsel for your specific situation.", by: "By" }, de: { blog: "Blog", updated: "Aktualisiert", reviewed: "Geprüft", minutes: "Min. Lesezeit", sources: "Quellen", related: "Verwandte Artikel", legal: "Dieser Artikel bietet allgemeine Informationen, keine Rechtsberatung. Wende dich für deinen konkreten Fall an deine Datenschutzberatung.", by: "Von" } };

export default async function BlogPost({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getPost(locale, slug);
  if (!post || post.status === "draft") notFound();
  const l = locale === "de" ? LABELS.de : LABELS.en;
  const author = AUTHORS[post.author] ?? { name: post.author, role: { en: "", de: "" }, bio: { en: "", de: "" } };
  const related = await relatedPosts(locale, post);
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB");
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: l.blog, path: "/blog" }, { name: post.title, path: `/blog/${slug}` }], locale),
          { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.description, datePublished: post.publishedAt, dateModified: post.updatedAt ?? post.publishedAt, inLanguage: locale, url: absoluteUrl(`/blog/${slug}`, locale), author: { "@type": "Organization", name: author.name }, publisher: { "@type": "Organization", name: "track.site" }, keywords: post.tags.join(", "), articleSection: post.category },
        ]}
      />
      <Container className="max-w-3xl py-14 md:py-20">
        <nav className="text-xs text-ink-3" aria-label="Breadcrumb">
          <Link href="/blog" className="hover:underline">
            {l.blog}
          </Link>{" "}
          / {post.category}
        </nav>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">{post.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{post.description}</p>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>
            {l.by} {author.name}
          </span>
          <time dateTime={post.publishedAt}>{dateFmt(post.publishedAt)}</time>
          {post.updatedAt ? <span>{l.updated} {dateFmt(post.updatedAt)}</span> : null}
          {post.reviewedAt ? <span>{l.reviewed} {dateFmt(post.reviewedAt)}</span> : null}
          <span>{post.readingMinutes} {l.minutes}</span>
          {post.tags.map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </p>
        <article className="prose prose-neutral mt-10 max-w-none text-ink-2 prose-headings:font-display prose-headings:text-ink prose-a:text-primary prose-code:rounded prose-code:bg-surface-2 prose-code:px-1 prose-pre:bg-ink prose-pre:text-white">
          <MDXRemote source={post.content} options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]] } }} />
        </article>
        {post.legalNotice ? <p className="mt-8 rounded-xl border border-line bg-surface p-4 text-xs text-ink-3">{l.legal}</p> : null}
        {post.sources.length ? (
          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">{l.sources}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {post.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} rel="noreferrer nofollow" target="_blank" className="text-primary hover:underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Card className="mt-10 p-5">
          <p className="text-sm font-semibold text-ink">{author.name}</p>
          <p className="text-xs text-ink-3">{author.role[locale === "de" ? "de" : "en"]}</p>
          <p className="mt-2 text-sm text-ink-2">{author.bio[locale === "de" ? "de" : "en"]}</p>
        </Card>
        {related.length ? (
          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold text-ink">{l.related}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/blog/${r.slug}`} className="block rounded-xl border border-line bg-surface p-4 text-sm font-medium text-ink hover:border-primary">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Container>
    </>
  );
}
