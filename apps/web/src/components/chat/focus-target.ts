/**
 * Reveal-and-focus of a workspace target (`data-focus-target="…"`), shared by the workspace-move
 * executor and the activity feed's next actions. Deterministic and side-effect-light: scrolls the
 * target into view (instantly under reduced motion), moves keyboard focus to it unless the reader
 * is typing (composer or any text field of a card), and marks it `data-revealed` for a short visible highlight (ring only —
 * never a layout change). Returns false when the target is not on the page.
 */
export const REVEAL_HIGHLIGHT_MS = 1600;

export function findTarget(name: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-focus-target="${name}"]`);
}

/** The reader is entering text (composer, a form field of a card, an editable region): focus is never taken away then. */
function isTyping(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !/^(button|submit|reset|checkbox|radio|range|file|color|image|hidden)$/i.test(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

export function revealTarget(name: string, options: { focus?: boolean } = {}): boolean {
  const el = findTarget(name);
  if (!el) return false;
  const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  const typing = isTyping(document.activeElement);
  if (options.focus !== false && !typing) {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }
  el.setAttribute("data-revealed", "");
  setTimeout(() => el.removeAttribute("data-revealed"), REVEAL_HIGHLIGHT_MS);
  return true;
}
