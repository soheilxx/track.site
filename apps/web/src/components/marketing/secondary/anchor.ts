/**
 * Stable fragment id for a heading: ASCII slug of the title (umlauts folded) prefixed with its
 * position, so ids are readable, never empty and never duplicated within a document.
 */
export function anchorId(title: string, index: number, prefix = "section"): string {
  const slug = title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug ? `${prefix}-${index + 1}-${slug}` : `${prefix}-${index + 1}`;
}
