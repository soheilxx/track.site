import type { HowItWorksCopy } from "../types";
import { SNIPPET } from "./samples";

/**
 * English (source language) copy of the how-it-works area. Same shape as every other locale file; see docs/14-localization.md.
 */

export const HOW_IT_WORKS_EN: HowItWorksCopy = {
  eyebrow: "How it works",
  title: "From your domain to verified conversions on every platform",
  intro: "One snippet on your site, one guided session with the assistant, one signed configuration you approve. Track takes the events from there — with consent evaluated for every destination and a debugger that shows you what happened.",
  cta: "Start with your domain",
  ctaSecondary: "See the features",
  stage: {
    title: "Snippet → Track → platforms",
    description: "The snippet on your website sends events from the browser; your shop or server sends the same conversions with a shared event id. Track evaluates consent at a policy gate and forwards each event to Meta, Google Ads, Google Analytics 4 and TikTok.",
    caption: "Snippet → Track → Consent/Policy → platforms. The same picture you see in the debugger for every real event.",
  },
  milestonesTitle: "Four milestones, one session",
  milestonesText: "This is the customer's view. The technical checks behind each milestone are listed further down.",
  youLabel: "You",
  outcomeLabel: "You get",
  steps: [
    { title: "Create your site", text: "Sign up with your domain. Track creates the site, a public six-character tracking id and the one-line snippet.", you: "enter the domain and paste the snippet — or install the Shopify, WooCommerce or Shopware app", outcome: "a verified installation: Track sees the first page view and confirms ownership by DNS, file or meta tag" },
    { title: "Let the assistant propose the setup", text: "The assistant detects platform and consent tool, proposes an event plan for your business type and asks for the public ids of the platforms you use.", you: "answer a few questions and enter pixel ids in chat, access tokens in the vault card", outcome: "a drafted configuration with mapped events and a real test event accepted by the vendor" },
    { title: "Approve and publish", text: "You see the diff, the recipients and the consent requirement of every destination. One approval publishes a signed, versioned bundle.", you: "read the diff and click approve", outcome: "a live configuration with its version number, rollback available with one click" },
    { title: "Watch and improve", text: "The debugger shows every event with its decision, the health score reports what to fix, and the assistant proposes the fix.", you: "check the score when it changes; approve improvements", outcome: "verified conversions on every platform, with evidence per event" },
  ],
  snippet: { title: "The snippet", code: SNIPPET, copy: "Copy snippet", copied: "Copied", note: "Served from a first-party CDN host; the configuration it loads is Ed25519-signed and verified before anything runs." },
  published: {
    title: "Configuration · version 13",
    state: "live",
    facts: [
      { label: "Approved by", value: "you, bound to the diff you read" },
      { label: "Signature", value: "Ed25519, verified by the SDK" },
      { label: "Destinations", value: "Meta (browser + server), Google Ads (server)" },
      { label: "Rollback", value: "version 12, one click" },
    ],
  },
  flows: {
    title: "Where your events come from",
    text: "Switch between the delivery modes. Every destination can run browser-only, server-only or both; the hybrid mode is the default because the two paths cover each other's gaps.",
    tabsLabel: "Delivery modes",
    items: [
      {
        id: "browser",
        label: "Browser only",
        title: "Events from the browser SDK",
        text: "The snippet collects page views, product views and cart events in the visitor's browser and sends them to Track's ingest host. Vendor tags load only after consent. This mode is quick to install but depends on the browser: blocked scripts and closed tabs lose events.",
        points: ["Install: one snippet", "Consent: evaluated in the browser and again on the server", "Gap: no event when the script is blocked or the tab closes early"],
      },
      {
        id: "server",
        label: "Server only",
        title: "Events from your server or shop",
        text: "Your shop platform, backend or CRM sends conversions to the server API with a source key. Purchases, refunds and offline conversions arrive reliably and are never blocked in the browser. Match data is limited to what your server knows.",
        points: ["Install: shop app or a signed request from your backend", "Reliable for purchases, refunds, leads from your CRM", "Gap: fewer browser signals for matching"],
      },
      {
        id: "hybrid",
        label: "Browser + server",
        title: "Both paths, one event id",
        text: "Browser and server send the same conversion with the same event id. Track normalizes both, applies the consent decision per destination and forwards them; the vendors deduplicate on the event id or the order id. You get the reach of the server path with the match quality of the browser path.",
        points: ["Default mode for every destination that supports both", "Deduplication: event id (Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn …), order id (Google Ads)", "Consent: one decision per event and destination for both paths"],
      },
    ],
  },
  checks: {
    title: "What Track checks along the way",
    summary: "Show the technical checks behind the four milestones",
    intro: "These checks run inside the guided session and later in the worker. They are the reason the four milestones are enough — you do not have to verify them by hand.",
    groups: [
      { title: "Site and installation", items: ["Domain format and reachability", "Ownership by DNS record, verification file or meta tag", "Snippet present and configuration signature verified in the browser", "First page view received on the ingest host"] },
      { title: "Platform, consent tool and event plan", items: ["Shop or CMS platform detected with a confidence level", "Consent tool detected (TCF 2.2, GPP, Cookiebot, OneTrust, Usercentrics or consent API)", "Event plan template chosen for the business type (shop, lead generation, SaaS, publisher)", "Required parameters per standard event, naming rules for custom events, PII blocked in properties"] },
      { title: "Destinations and credentials", items: ["Public ids validated against the vendor's format", "Access tokens stored in the vault via card or OAuth; never in the transcript", "Consent purpose required by each destination recorded", "Click-id matrix checked: every id forwarded only to its platform"] },
      { title: "Test, review and publish", items: ["Test event sent through the real queue and worker; vendor verdict recorded", "Diff, recipient list and approver bound to one approval token", "Bundle signed with Ed25519, versioned and immutable", "Audit entry for every tool call and every approval"] },
      { title: "After go-live", items: ["Health score: consent coverage, critical events, schema quality, duplicates, delivery, freshness", "Retries with backoff, circuit breaker and dead-letter queue per destination", "Issues grouped by fingerprint, each naming the tool that fixes it", "Rollback to any earlier version"] },
    ],
  },
  architectureTitle: "Two planes, one signed configuration",
  architectureText: "A control plane for people and the assistant, a data plane for events. They share nothing but the signed configuration — a technical proof after the milestones, not a prerequisite for using Track.",
  architectureColumns: { component: "Component", responsibility: "Responsibility" },
  architecture: [
    { title: "Browser SDK", text: "Consent-gated storage, CMP adapters, batching transport, SPA tracking, vendor loaders with shared dedup ids. Kept under 30 KB gzip by a CI budget." },
    { title: "Collector", text: "Origin allow-list, rate limits, HMAC-signed server requests, kill switches, durable queue hand-off before the 202 is returned." },
    { title: "Worker", text: "Normalization, PII scan, consent policy, event store, conversion dedup, usage ledger, fan-out, delivery with retries and DLQ." },
    { title: "Control plane", text: "Dashboard and assistant: typed tools, approvals, audit log, RBAC, billing, privacy center — separated from the data plane." },
  ],
  faqTitle: "Questions",
  faq: [
    { q: "Do I need a tag manager?", a: "No. The tracker loads vendor tags itself after consent. Existing GTM setups can coexist during migration." },
    { q: "Where is data processed?", a: "In the EU. Vendor APIs receive only what you configured, under the documented transfer basis shown for each destination." },
    { q: "How is the configuration protected?", a: "Bundles are immutable, versioned and Ed25519-signed; the SDK verifies the signature before applying any configuration." },
    { q: "What if the AI provider is unavailable?", a: "The same setup states are available as a rule-based wizard. Nothing in the pipeline depends on a model being online." },
  ],
  closing: { title: "Ready when you are", text: "Create your site, paste the snippet and let the assistant configure the first destination.", cta: "Start free", secondary: "Read the docs" },
};
