import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import readingTime from "reading-time";

/**
 * MDX blog content lives in apps/web/content/blog/<locale>/<slug>.mdx with front matter.
 * Slugs are shared across locales so hreflang pairs line up.
 */
export interface PostMeta {
  slug: string;
  locale: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: string;
  publishedAt: string;
  updatedAt: string | null;
  reviewedAt: string | null;
  status: "published" | "draft";
  coverAlt: string;
  readingMinutes: number;
  sources: Array<{ title: string; url: string }>;
  legalNotice: boolean;
}

export interface Post extends PostMeta {
  content: string;
}

export const AUTHORS: Record<string, { name: string; role: { en: string; de: string }; bio: { en: string; de: string } }> = {
  "track-site-editorial": {
    name: "track.site editorial team",
    role: { en: "Product & engineering", de: "Produkt & Engineering" },
    bio: {
      en: "The people building track.site: engineers and analysts who work on server-side tracking, consent tooling and connector integrations every day.",
      de: "Die Menschen hinter track.site: Engineers und Analysts, die täglich an Server-Side Tracking, Consent-Tooling und Connector-Integrationen arbeiten.",
    },
  },
};

function contentDir(locale: string): string {
  return path.resolve(process.cwd(), "content", "blog", locale);
}

function toMeta(locale: string, slug: string, raw: string): Post | null {
  const { data, content } = matter(raw);
  if (!data.title || !data.description || !data.publishedAt) return null;
  const status = data.status === "draft" ? "draft" : "published";
  return {
    slug,
    locale,
    title: String(data.title),
    description: String(data.description),
    excerpt: String(data.excerpt ?? data.description),
    category: String(data.category ?? "guides"),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    author: String(data.author ?? "track-site-editorial"),
    publishedAt: new Date(data.publishedAt).toISOString(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
    reviewedAt: data.reviewedAt ? new Date(data.reviewedAt).toISOString() : null,
    status,
    coverAlt: String(data.coverAlt ?? data.title),
    readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
    sources: Array.isArray(data.sources) ? data.sources.map((s: { title: string; url: string }) => ({ title: String(s.title), url: String(s.url) })) : [],
    legalNotice: Boolean(data.legalNotice),
    content,
  };
}

export async function listPosts(locale: string, options: { includeDrafts?: boolean } = {}): Promise<PostMeta[]> {
  const dir = contentDir(locale);
  if (!existsSync(dir)) return [];
  const posts: PostMeta[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".mdx")) continue;
    const slug = file.replace(/\.mdx$/, "");
    const post = toMeta(locale, slug, readFileSync(path.join(dir, file), "utf8"));
    if (!post) continue;
    if (post.status === "draft" && !options.includeDrafts) continue;
    const { content: _c, ...meta } = post;
    posts.push(meta);
  }
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function getPost(locale: string, slug: string): Promise<Post | null> {
  if (!/^[a-z0-9-]{3,120}$/.test(slug)) return null;
  const file = path.join(contentDir(locale), `${slug}.mdx`);
  if (!existsSync(file)) return null;
  return toMeta(locale, slug, readFileSync(file, "utf8"));
}

export async function listCategories(locale: string): Promise<Array<{ category: string; count: number }>> {
  const posts = await listPosts(locale);
  const map = new Map<string, number>();
  for (const p of posts) map.set(p.category, (map.get(p.category) ?? 0) + 1);
  return Array.from(map, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}

export async function relatedPosts(locale: string, post: PostMeta, limit = 3): Promise<PostMeta[]> {
  const posts = (await listPosts(locale)).filter((p) => p.slug !== post.slug);
  const scored = posts.map((p) => ({ p, score: (p.category === post.category ? 2 : 0) + p.tags.filter((t) => post.tags.includes(t)).length }));
  return scored
    .sort((a, b) => b.score - a.score || b.p.publishedAt.localeCompare(a.p.publishedAt))
    .slice(0, limit)
    .map((s) => s.p);
}
