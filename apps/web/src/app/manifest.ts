import type { MetadataRoute } from "next";

/**
 * Web app manifest (served at `/manifest.webmanifest`). The visible name is the brand "Track"
 * (supplement §2); the icons are the raster exports of the mark under `public/brand/`, rendered
 * full-bleed so they also work as maskable icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Track",
    short_name: "Track",
    description: "AI-first tag manager and server-side event router.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#1f4fe0",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
