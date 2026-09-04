import type { ConsentCopy, ContactFormCopy, FooterCopy, HeaderCopy } from "../types";

/**
 * English (source language) copy of the shared area. Same shape as every other locale file; see docs/14-localization.md.
 */

export const HEADER_COPY_EN: HeaderCopy = {
  brandHome: "Track – home",
  mainNav: "Main",
  skipToContent: "Skip to content",
  groups: [
    {
      key: "product",
      label: "Product",
      columns: [
        {
          key: "overview",
          title: "Overview",
          links: [
            { href: "/features", label: "Features", description: "What Track does, from guided setup to delivery" },
            { href: "/how-it-works", label: "How it works", description: "Create a site, install the snippet, connect destinations, publish" },
          ],
        },
        {
          key: "capabilities",
          title: "Capabilities",
          wide: true,
          links: [
            { href: "/features/ai-setup", label: "AI-guided setup", description: "Describe your site, confirm each step, publish a signed configuration" },
            { href: "/features/server-side-tracking", label: "Server-side event router", description: "Browser and server delivery with one shared event ID for deduplication" },
            { href: "/features/event-debugger", label: "Event debugger", description: "Every event with its consent snapshot, routing decision and vendor response" },
            { href: "/features/data-quality", label: "Data quality", description: "One health score with explainable parts; every issue links to its fix" },
            { href: "/features/consent", label: "Consent", description: "Strict opt-in defaults and Consent Mode v2; nothing is sent without the purpose" },
            { href: "/features/attribution", label: "Attribution", description: "Click IDs only for the destination that needs them, only with consent" },
          ],
        },
      ],
    },
    {
      key: "integrations",
      label: "Integrations",
      columns: [
        {
          key: "ads",
          title: "Ads platforms",
          links: [
            { href: "/integrations/meta", label: "Meta Ads" },
            { href: "/integrations/google-ads", label: "Google Ads" },
            { href: "/integrations/tiktok", label: "TikTok Ads" },
            { href: "/integrations/linkedin", label: "LinkedIn Ads" },
            { href: "/integrations/microsoft", label: "Microsoft Ads" },
            { href: "/integrations/reddit", label: "Reddit Ads" },
          ],
        },
        {
          key: "data",
          title: "Analytics and data",
          links: [
            { href: "/integrations/google-analytics", label: "Google Analytics 4" },
            { href: "/integrations/webhook", label: "Webhooks" },
            { href: "/integrations/affiliate-postbacks", label: "Affiliate postbacks" },
          ],
        },
        {
          key: "shops",
          title: "Shop systems",
          links: [
            { href: "/integrations/shopify", label: "Shopify" },
            { href: "/integrations/woocommerce", label: "WooCommerce" },
            { href: "/integrations/shopware", label: "Shopware 6" },
          ],
        },
      ],
      more: { href: "/integrations", label: "All integrations", description: "Browser tag plus server-side API for every platform that offers one" },
    },
    {
      key: "resources",
      label: "Resources",
      columns: [
        {
          key: "learn",
          title: "Learn",
          links: [
            { href: "/tracking-knowledge", label: "Tracking Knowledge", description: "Guides on server-side tracking, e-commerce tracking, consent and attribution" },
            { href: "/docs", label: "Documentation", description: "Install the snippet, send events, integrate consent, configure destinations" },
          ],
        },
        {
          key: "docs",
          title: "Docs quick links",
          links: [
            { href: "/docs#install", label: "Install the snippet" },
            { href: "/docs#events", label: "Send browser events" },
            { href: "/docs#server", label: "Server API and offline conversions" },
            { href: "/docs#consent", label: "Consent integration" },
          ],
        },
        {
          key: "help",
          title: "Help",
          links: [
            { href: "/support", label: "Support" },
            { href: "/status", label: "System status" },
            { href: "/security", label: "Security" },
            { href: "/contact", label: "Contact" },
            { href: "/demo", label: "Book a demo" },
          ],
        },
      ],
    },
  ],
  pricing: { href: "/pricing", label: "Pricing" },
  login: { href: "/login", label: "Log in" },
  start: { href: "/signup", label: "Start free" },
  language: "Language",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  menuTitle: "Menu",
};

export const FOOTER_COPY_EN: FooterCopy = {
  tagline: "AI-first tag manager, consent-aware server-side event router and first-party event layer.",
  region: "EU data region by default. Processor under Art. 28 GDPR.",
  rights: "All rights reserved.",
  legalNote: "Legal pages are provided as information, not legal advice.",
  language: "Language",
  columns: [
    {
      key: "product",
      title: "Product",
      links: [
        { href: "/features", label: "Features" },
        { href: "/how-it-works", label: "How it works" },
        { href: "/pricing", label: "Pricing" },
        { href: "/docs", label: "Documentation" },
      ],
    },
    {
      key: "integrations",
      title: "Integrations",
      links: [
        { href: "/integrations", label: "All integrations" },
        { href: "/integrations/meta", label: "Meta Ads" },
        { href: "/integrations/google-ads", label: "Google Ads" },
        { href: "/integrations/google-analytics", label: "Google Analytics 4" },
        { href: "/integrations/shopify", label: "Shopify" },
        { href: "/integrations/woocommerce", label: "WooCommerce" },
        { href: "/integrations/shopware", label: "Shopware 6" },
      ],
    },
    {
      key: "knowledge",
      title: "Knowledge",
      links: [
        { href: "/tracking-knowledge", label: "Tracking Knowledge" },
        { href: "/docs#install", label: "Install the snippet" },
        { href: "/docs#server", label: "Server API" },
        { href: "/docs#consent", label: "Consent integration" },
        { href: "/tracking-knowledge/feed.xml", label: "RSS feed" },
      ],
    },
    {
      key: "company",
      title: "Company",
      links: [
        { href: "/contact", label: "Contact" },
        { href: "/demo", label: "Book a demo" },
        { href: "/support", label: "Support" },
        { href: "/status", label: "System status" },
        { href: "/security", label: "Security" },
      ],
    },
    {
      key: "legal",
      title: "Legal",
      links: [
        { href: "/privacy", label: "Privacy" },
        { href: "/terms", label: "Terms" },
        { href: "/data-processing", label: "Data processing (DPA)" },
        { href: "/subprocessors", label: "Subprocessors" },
        { href: "/imprint", label: "Imprint" },
      ],
    },
  ],
};

export const CONSENT_COPY_EN: ConsentCopy = {
  title: "Cookies and similar technologies",
  description: "This website only stores what it needs to run. Optional categories become active only after you allow them.",
  categories: {
    necessary: { label: "Strictly necessary", text: "Language choice, theme, session and security. Always on." },
    analytics: { label: "Analytics", text: "Aggregated usage measurement to improve the website." },
    marketing: { label: "Marketing", text: "Conversion measurement for advertising campaigns." },
  },
  acceptAll: "Accept all",
  declineOptional: "Decline optional",
  save: "Save selection",
  close: "Close",
  privacy: { href: "/privacy", label: "Privacy policy" },
};

export const FORM_COPY_EN: ContactFormCopy = { name: "Name", email: "E-mail", company: "Company (optional)", message: "Message", submit: "Send", sent: "Thank you — we received your message and reply by e-mail.", invalid: "Please check the fields: name, a valid e-mail and a message of at least 10 characters.", rateLimited: "Too many requests from this network; please try again later.", generic: "Something went wrong. Please try again.", privacy: "We store your request to answer it and delete it after handling. See the privacy policy." };
