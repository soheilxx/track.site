import { isValidElement, type ReactNode } from "react";
import { CodeBlock } from "@track-site/ui";

interface CodeElementProps {
  className?: string;
  children?: ReactNode;
  /** Fence meta (```json title="request.json"), exposed by `rehypeCodeMeta` in lib/knowledge-article.ts. */
  metastring?: string;
}

/** Plain text of a React subtree (fenced code compiles to one string child; inline elements are flattened defensively). */
export function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** `title="…"` (or `title='…'`) from a fence meta string. */
export function titleFromMeta(meta: string | undefined): string | undefined {
  const m = /(?:^|\s)title=(?:"([^"]+)"|'([^']+)')/.exec(meta ?? "");
  return m?.[1] ?? m?.[2];
}

/**
 * Fenced code block → `<CodeBlock>` (language label, copy button with a polite announcement). MDX
 * renders ```lang as `<pre><code class="language-lang">`; this replaces the whole `<pre>`. The
 * `[&_pre]` overrides neutralise the generic `.prose-track pre` frame so the block is not framed twice.
 */
export function ArticlePre({ children, labels }: { children?: ReactNode; labels: { copy: string; copied: string } }) {
  const code = isValidElement<CodeElementProps>(children) ? children : null;
  const source = textOf(code ? code.props.children : children).replace(/\n$/, "");
  const language = /(?:^|\s)language-([\w-]+)/.exec(code?.props.className ?? "")?.[1];
  return (
    <div className="my-6 [&_pre]:rounded-none [&_pre]:border-0 [&_pre]:bg-transparent [&_pre]:px-4 [&_pre]:py-3 [&_pre]:text-[13px]">
      <CodeBlock code={source} language={language} title={titleFromMeta(code?.props.metastring)} copyLabel={labels.copy} copiedLabel={labels.copied} />
    </div>
  );
}
