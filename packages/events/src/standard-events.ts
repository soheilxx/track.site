/**
 * Vendor-neutral standard event catalog. Vendor names never define the internal model;
 * connectors translate from these canonical names.
 */
export type EventPurpose = "analytics" | "marketing";
export type EventCategory = "engagement" | "lead" | "auth" | "commerce" | "subscription";

export interface StandardEventDefinition {
  name: string;
  category: EventCategory;
  description: string;
  /** minimum purposes needed for a destination of that kind to receive it */
  purposes: EventPurpose[];
  requiredParams: string[];
  optionalParams: string[];
  commerce: boolean;
  /** conversions must come from an authoritative (server-verified) source to be trusted for ads */
  authoritativeSourceRecommended: boolean;
}

const commerceItems = ["items", "currency", "value"];

export const STANDARD_EVENTS: readonly StandardEventDefinition[] = [
  def("page_view", "engagement", "A page or virtual page was viewed", [], ["title", "path", "referrer"]),
  def("view_content", "engagement", "A content or product detail was viewed", [], ["content_id", "content_type", "content_name", ...commerceItems]),
  def("search", "engagement", "A search was performed", ["search_term"], ["results_count"]),
  def("sign_up", "auth", "A user registered", [], ["method"]),
  def("login", "auth", "A user logged in", [], ["method"]),
  def("generate_lead", "lead", "A lead form or contact request was submitted", [], ["currency", "value", "lead_type"]),
  def("view_item_list", "commerce", "A product list was viewed", ["items"], ["item_list_id", "item_list_name"], true),
  def("select_item", "commerce", "A product was selected from a list", ["items"], ["item_list_id", "item_list_name"], true),
  def("view_item", "commerce", "A product detail page was viewed", ["items"], ["currency", "value"], true),
  def("add_to_wishlist", "commerce", "A product was added to a wishlist", ["items"], ["currency", "value"], true),
  def("add_to_cart", "commerce", "A product was added to the cart", ["items"], ["currency", "value"], true),
  def("remove_from_cart", "commerce", "A product was removed from the cart", ["items"], ["currency", "value"], true),
  def("view_cart", "commerce", "The cart was viewed", ["items"], ["currency", "value"], true),
  def("begin_checkout", "commerce", "Checkout started", ["items"], ["currency", "value", "coupon"], true),
  def("add_shipping_info", "commerce", "Shipping information was added", ["items"], ["currency", "value", "shipping_tier"], true),
  def("add_payment_info", "commerce", "Payment information was added", ["items"], ["currency", "value", "payment_type"], true),
  def("purchase", "commerce", "An order was completed", ["order_id", "currency", "value"], ["items", "tax", "shipping", "coupon"], true, true),
  def("refund", "commerce", "An order was refunded (fully or partially)", ["order_id"], ["currency", "value", "items"], true, true),
  def("subscribe", "subscription", "A subscription or newsletter signup happened", [], ["plan", "currency", "value"]),
  def("start_trial", "subscription", "A free trial was started", [], ["plan", "currency", "value"], false, true),
  def("contact", "lead", "A contact request was sent (form, call, chat)", [], ["method"]),
  def("book_appointment", "lead", "An appointment or demo was booked", [], ["currency", "value", "appointment_type"]),
  def("download", "engagement", "A file or app was downloaded", [], ["file_name", "content_type"]),
];

function def(
  name: string,
  category: EventCategory,
  description: string,
  requiredParams: string[],
  optionalParams: string[],
  commerce = false,
  authoritative = false,
): StandardEventDefinition {
  const purposes: EventPurpose[] =
    category === "commerce" || category === "lead" || category === "subscription" ? ["analytics", "marketing"] : ["analytics"];
  return {
    name,
    category,
    description,
    purposes,
    requiredParams,
    optionalParams,
    commerce,
    authoritativeSourceRecommended: authoritative,
  };
}

export const STANDARD_EVENT_NAMES = STANDARD_EVENTS.map((e) => e.name);
const byName = new Map(STANDARD_EVENTS.map((e) => [e.name, e]));

export function getStandardEvent(name: string): StandardEventDefinition | undefined {
  return byName.get(name);
}

export function isStandardEvent(name: string): boolean {
  return byName.has(name);
}

/** Custom events: lower snake case, 2-64 chars, must not collide with reserved prefixes. */
export const CUSTOM_EVENT_NAME_REGEX = /^[a-z][a-z0-9_]{1,63}$/;
const RESERVED_PREFIXES = ["track_", "ts_", "internal_", "system_", "google_", "gtm_", "ga_", "fb_", "meta_"];

export function isValidCustomEventName(name: string): boolean {
  return CUSTOM_EVENT_NAME_REGEX.test(name) && !RESERVED_PREFIXES.some((p) => name.startsWith(p));
}

/** Normalize common vendor/legacy names to canonical names (explicit mapping table, never guessed). */
export const LEGACY_NAME_MAP: Readonly<Record<string, string>> = {
  PageView: "page_view",
  pageview: "page_view",
  ViewContent: "view_content",
  Search: "search",
  CompleteRegistration: "sign_up",
  Lead: "generate_lead",
  AddToWishlist: "add_to_wishlist",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Subscribe: "subscribe",
  ViewCart: "view_cart",
  PlaceAnOrder: "purchase",
  CompletePayment: "purchase",
  lead: "generate_lead",
  StartTrial: "start_trial",
  Contact: "contact",
  Schedule: "book_appointment",
  Download: "download",
  custom_event: "custom_event",
};
