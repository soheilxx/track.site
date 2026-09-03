import { Bricolage_Grotesque, Inter } from "next/font/google";

/**
 * Fonts shared by every root layout. The app has no single root layout on purpose: the marketing
 * tree (`[locale]/layout.tsx`) and the dashboard (`app/layout.tsx`) each render their own
 * `<html>`, so the marketing pages stay statically prerendered while the dashboard is dynamic.
 * The CSS variables feed `--font-sans` / `--font-display` in `@track-site/ui` tokens.
 */
export const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
export const bricolage = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-bricolage", display: "swap", weight: ["500", "600", "700", "800"] });

/** Class list for `<html>`: exposes both font variables to the whole document. */
export const fontClassName = `${inter.variable} ${bricolage.variable}`;

/** Body classes shared by every document (root layouts, global 404, global error). */
export const bodyClassName = "min-h-screen bg-ground text-ink antialiased";
