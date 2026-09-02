import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-bricolage", display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "track.site", template: "%s · track.site" },
  description: "AI-first tag manager, consent-aware server-side event router and first-party event layer.",
};

/**
 * Root layout: fonts + theme attribute. Locale-specific <html lang> is set by the nested
 * [locale] layout for marketing pages and by the app layout for the dashboard.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${bricolage.variable}`}>
      <head>
        <script
          // Theme is applied before paint from the stored preference (no flash); no inline user data.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('ts-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-ground text-ink antialiased">{children}</body>
    </html>
  );
}
