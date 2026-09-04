import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { KNOWLEDGE_ARTICLE_COPY } from "@/lib/marketing-copy/knowledge-article";

vi.mock("server-only", () => ({}));

const { compileArticle } = await import("@/lib/knowledge-article");
const { articleMdxComponents } = await import("./mdx-components");

/**
 * GFM task lists in articles are editorial checklists: remark-gfm would emit disabled, unlabeled
 * `<input type="checkbox">` controls (axe `label`, critical, WCAG 4.1.2). The component map replaces
 * them with a decorative marker and visually hidden localized state text, in both locales.
 */
describe("article MDX task lists", () => {
  const source = "## Checklist\n\n- [ ] Consent is evaluated on the server\n- [x] Purchase carries `currency`\n- plain item\n";

  it("renders no form control, but the localized state as hidden text before each item (en)", async () => {
    const { content } = await compileArticle(source, articleMdxComponents(KNOWLEDGE_ARTICLE_COPY.en));
    const html = renderToStaticMarkup(content);
    expect(html).not.toContain("<input");
    expect(html).toContain("To do: ");
    expect(html).toContain("Done: ");
    expect(html).toContain("Consent is evaluated on the server");
    expect(html).toContain('aria-hidden="true"');
    // task items lose the disc bullet, the plain item keeps the default list rendering
    expect(html.match(/<li class="flex list-none items-start gap-2">/g)).toHaveLength(2);
    expect(html).toContain("<li>plain item</li>");
  });

  it("uses the German labels for the German copy", async () => {
    const { content } = await compileArticle(source, articleMdxComponents(KNOWLEDGE_ARTICLE_COPY.de));
    const html = renderToStaticMarkup(content);
    expect(html).not.toContain("<input");
    expect(html).toContain("Offen: ");
    expect(html).toContain("Erledigt: ");
  });
});
