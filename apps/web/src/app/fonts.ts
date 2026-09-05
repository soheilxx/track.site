import { Bricolage_Grotesque, Inter } from "next/font/google";

/**
 * Fonts shared by every root layout. The app has no single root layout on purpose: the marketing
 * tree (`[locale]/layout.tsx`) and the dashboard (`app/layout.tsx`) each render their own
 * `<html>`, so the marketing pages stay statically prerendered while the dashboard is dynamic.
 * The CSS variables feed `--font-sans` / `--font-display` in `@track-site/ui` tokens.
 */
/*
 * `subsets` only decides which font files are *preloaded* from <head> (next/font emits the @font-face rules of every
 * subset either way, so glyphs outside a preloaded file still load on demand). The six locales' UI copy, catalogs and
 * articles use only characters of the `latin` range (U+0000–00FF, U+0152–0153, U+2000–206F, €, …; scan of
 * messages/, marketing-copy/ and content/ on 2026-09-05: the only code points outside it are →, ≈, ≤ and Σ, which
 * `latin-ext` does not cover either), so preloading `latin-ext` (Inter 85.6 KB + Bricolage 19 KB) only competed with
 * the HTML and the render-blocking CSS on mobile. Bricolage is the headline font with `display: swap` and a
 * size-adjusted fallback: it is not preloaded at all, which keeps the critical path to the CSS and one Inter file.
 */
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", weight: ["500", "600", "700", "800"], preload: false });

/** Class list for `<html>`: exposes both font variables to the whole document. */
export const fontClassName = `${inter.variable} ${bricolage.variable}`;

/** Body classes shared by every document (root layouts, global 404, global error). */
export const bodyClassName = "min-h-screen bg-ground text-ink antialiased";
