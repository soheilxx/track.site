/**
 * Search-snippet helpers. Page copy stays long and descriptive; the <title> and meta description
 * derived from it are cut at a sentence, colon or word boundary so search results show clean text.
 */
export function seoTitle(text: string, max = 65): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const colon = t.indexOf(": ");
  if (colon > 20 && colon <= max) return t.slice(0, colon);
  return cutAtWord(t, max, "");
}

export function seoDescription(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const sentence = t.slice(0, max).lastIndexOf(". ");
  if (sentence > max * 0.5) return t.slice(0, sentence + 1);
  return cutAtWord(t, max, "…");
}

function cutAtWord(t: string, max: number, suffix: string): string {
  const cut = t.slice(0, max - suffix.length);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:\-–—\s]+$/, "") + suffix;
}
