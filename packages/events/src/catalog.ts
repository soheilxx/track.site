/**
 * Measurement plan templates proposed by the assistant and used to seed config drafts.
 * Each plan lists canonical events with trigger hints; critical conversions require an
 * authoritative source before they are enabled for ad destinations.
 */
export type BusinessType = "ecommerce" | "lead_generation" | "saas" | "content" | "other";

export interface PlanEvent {
  name: string;
  critical: boolean;
  /** how the SDK or integration captures it */
  capture: "auto_page" | "data_layer" | "shop_integration" | "manual_api" | "form_submit" | "click_selector";
  requiresAuthoritativeSource: boolean;
  hint: string;
}

export interface MeasurementPlan {
  businessType: BusinessType;
  label: string;
  events: PlanEvent[];
}

export const MEASUREMENT_PLANS: Record<BusinessType, MeasurementPlan> = {
  ecommerce: {
    businessType: "ecommerce",
    label: "E-commerce",
    events: [
      { name: "page_view", critical: false, capture: "auto_page", requiresAuthoritativeSource: false, hint: "Automatic, including SPA navigation." },
      { name: "view_item", critical: false, capture: "data_layer", requiresAuthoritativeSource: false, hint: "Product detail pages from the shop data layer." },
      { name: "add_to_cart", critical: true, capture: "data_layer", requiresAuthoritativeSource: false, hint: "Cart button or shop event." },
      { name: "begin_checkout", critical: true, capture: "data_layer", requiresAuthoritativeSource: false, hint: "Checkout start." },
      { name: "add_payment_info", critical: false, capture: "data_layer", requiresAuthoritativeSource: false, hint: "Payment step." },
      { name: "purchase", critical: true, capture: "shop_integration", requiresAuthoritativeSource: true, hint: "Server-verified order from the shop integration; browser purchase only as supplementary path." },
      { name: "refund", critical: false, capture: "shop_integration", requiresAuthoritativeSource: true, hint: "Server-verified refund." },
    ],
  },
  lead_generation: {
    businessType: "lead_generation",
    label: "Lead generation",
    events: [
      { name: "page_view", critical: false, capture: "auto_page", requiresAuthoritativeSource: false, hint: "Automatic." },
      { name: "view_content", critical: false, capture: "auto_page", requiresAuthoritativeSource: false, hint: "Key landing pages." },
      { name: "generate_lead", critical: true, capture: "form_submit", requiresAuthoritativeSource: false, hint: "Form submission (no field values captured)." },
      { name: "sign_up", critical: false, capture: "form_submit", requiresAuthoritativeSource: false, hint: "Registration." },
    ],
  },
  saas: {
    businessType: "saas",
    label: "SaaS",
    events: [
      { name: "page_view", critical: false, capture: "auto_page", requiresAuthoritativeSource: false, hint: "Automatic." },
      { name: "sign_up", critical: true, capture: "manual_api", requiresAuthoritativeSource: false, hint: "Trial or account creation, ideally server-side." },
      { name: "login", critical: false, capture: "manual_api", requiresAuthoritativeSource: false, hint: "Login." },
      { name: "begin_checkout", critical: false, capture: "manual_api", requiresAuthoritativeSource: false, hint: "Plan selection." },
      { name: "subscribe", critical: true, capture: "manual_api", requiresAuthoritativeSource: true, hint: "Server-side subscription start (billing webhook)." },
    ],
  },
  content: {
    businessType: "content",
    label: "Content / publisher",
    events: [
      { name: "page_view", critical: true, capture: "auto_page", requiresAuthoritativeSource: false, hint: "Automatic, including SPA navigation." },
      { name: "view_content", critical: false, capture: "auto_page", requiresAuthoritativeSource: false, hint: "Article views with content id." },
      { name: "search", critical: false, capture: "manual_api", requiresAuthoritativeSource: false, hint: "Site search (term only, never PII)." },
      { name: "subscribe", critical: true, capture: "form_submit", requiresAuthoritativeSource: false, hint: "Newsletter signup." },
    ],
  },
  other: {
    businessType: "other",
    label: "Other",
    events: [
      { name: "page_view", critical: true, capture: "auto_page", requiresAuthoritativeSource: false, hint: "Automatic." },
      { name: "generate_lead", critical: false, capture: "form_submit", requiresAuthoritativeSource: false, hint: "Contact form." },
    ],
  },
};

export const BUSINESS_TYPES = Object.keys(MEASUREMENT_PLANS) as BusinessType[];
