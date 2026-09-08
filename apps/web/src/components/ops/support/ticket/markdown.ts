/**
 * Minimal Markdown → HTML for agent replies (client-safe, pure). Deliberately small: paragraphs, line
 * breaks, `**bold**`, `*italic*` / `_italic_`, `` `code` ``, fenced code blocks, `- ` / `1. ` lists,
 * `> ` quotes, `[text](https://…)` links and bare http(s) URLs. Everything is HTML-escaped before any
 * markup is added and link targets are limited to http(s)/mailto/tel, so the output is safe by
 * construction; the server still runs it through `sanitizeHtml` before storing or mailing it
 * (defence in depth), and the composer preview renders it in the browser.
 */

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;
const URL_RE = /(^|[\s(])((?:https?:\/\/)[^\s<>()]+[^\s<>().,;:!?'"])/g;

function inline(text: string): string {
  const codes: string[] = [];
  // code spans first: their content is literal (already escaped, never formatted)
  let out = escape(text).replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\uE000${codes.length - 1}\uE001`;
  });
  // links: [text](url) — the url was escaped above, so decode &amp; for the scheme check only
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
    const raw = href.replace(/&amp;/g, "&");
    if (!SAFE_HREF.test(raw)) return m;
    return `<a href="${escape(raw)}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`;
  });
  // bare urls outside of the links just made
  out = out.replace(URL_RE, (m, lead: string, url: string, offset: number, whole: string) => {
    const before = whole.slice(0, offset + lead.length);
    if (/href="[^"]*$/.test(before) || /<a [^>]*>[^<]*$/.test(before)) return m;
    const raw = url.replace(/&amp;/g, "&");
    return `${lead}<a href="${escape(raw)}" rel="noopener noreferrer nofollow" target="_blank">${url}</a>`;
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  return out.replace(/\uE000(\d+)\uE001/g, (_m, i: string) => codes[Number(i)] ?? "");
}

type Block = { kind: "p" | "quote"; lines: string[] } | { kind: "ul" | "ol"; items: string[] } | { kind: "code"; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) buf.push(lines[i++]!);
      i++; // closing fence (or end of text)
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length) {
        const m = kind === "ul" ? lines[i]!.match(/^\s*[-*]\s+(.*)$/) : lines[i]!.match(/^\s*\d+[.)]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]!);
        i++;
      }
      blocks.push({ kind, items });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) buf.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", lines: buf });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^```/.test(lines[i]!) && !/^\s*[-*]\s+/.test(lines[i]!) && !/^\s*\d+[.)]\s+/.test(lines[i]!) && !/^\s*>/.test(lines[i]!)) buf.push(lines[i++]!);
    blocks.push({ kind: "p", lines: buf });
  }
  return blocks;
}

/** Markdown subset → HTML (escaped, safe links, well-formed). Empty input → empty string. */
export function markdownToHtml(src: string): string {
  const parts: string[] = [];
  for (const block of parseBlocks(src)) {
    switch (block.kind) {
      case "code":
        parts.push(`<pre><code>${escape(block.text)}</code></pre>`);
        break;
      case "ul":
      case "ol":
        parts.push(`<${block.kind}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${block.kind}>`);
        break;
      case "quote":
        parts.push(`<blockquote><p>${block.lines.map(inline).join("<br>")}</p></blockquote>`);
        break;
      default:
        parts.push(`<p>${block.lines.map((l) => inline(l.trim())).join("<br>")}</p>`);
    }
  }
  return parts.join("\n");
}

/** Plain-text rendering of the same subset for the text part of an e-mail (markers removed, links kept). */
export function markdownToText(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .replace(/^```.*$/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
