import type { AuthCopy } from "../types";

/**
 * English (source language) copy of the auth area. Same shape as every other locale file; see docs/14-localization.md.
 */

export const AUTH_COPY_EN: AuthCopy = {
  plan: { selected: "Selected on the pricing page: {plan}, {interval}. Checkout follows after the setup; you can still change the plan there.", intervals: { monthly: "billed monthly", yearly: "billed yearly" } },
  shell: {
    brandHome: "Track – home",
    legalLabel: "Legal",
    legal: { privacy: "Privacy", terms: "Terms", imprint: "Imprint", security: "Security" },
    region: "EU data region · Processor under Art. 28 GDPR",
    stepsLabel: "Setup steps",
  },
  steps: ["Create account", "Confirm e-mail", "Add your website"],
  signals: [
    { icon: "passkey", title: "Passkeys and two-factor login", text: "Sign in with a passkey or protect your account with an authenticator app." },
    { icon: "eu", title: "EU data region", text: "Event data is processed in the EU by default. Track acts as a processor under Art. 28 GDPR." },
    { icon: "consent", title: "Consent decides delivery", text: "An event reaches a platform only when the consent state allows it. Nothing is guessed." },
  ],
  preview: {
    eyebrow: "What you set up next",
    title: "One snippet. Verified events. Consent respected.",
    text: "Track receives the events of your website, checks them against the consent state and your policy, and delivers them to the platforms you connect.",
    caption: "Illustration with example values, not live data.",
    diagram: {
      title: "Data flow: Website, Track, consent gate, destinations",
      website: "Website",
      websiteSub: "browser · server",
      track: "Track",
      trackSub: "verified events",
      consent: "Consent",
      consentState: "granted",
      destinations: ["Meta", "Google Ads", "GA4"],
      delivered: "delivered (example)",
    },
  },
};
