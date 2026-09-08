/**
 * Macro placeholders (client-safe, pure). The composer substitutes them when a macro is inserted so the
 * operator sees and can edit the final text; the server never guesses. Supported forms:
 * `{{ticket.number}}`, `{{requester.first_name}}`, `{{requester.name}}`, `{{requester.email}}`,
 * `{{agent.name}}`, `{{agent.first_name}}`, `{{organisation.name}}` / `{{organization.name}}` and the
 * single-brace legacy names of the seeded global macros (`{requester_name}`, `{ticket_number}`,
 * `{agent_name}`). Unknown placeholders are left untouched (visible, never silently dropped); a missing
 * value (no organisation, no requester name) becomes an empty string except the requester's first name,
 * which falls back to the name before the `@` of the address so a greeting never reads "Hello ,".
 */
export interface PlaceholderValues {
  ticketNumber: number;
  requesterName: string | null;
  requesterEmail: string;
  agentName: string;
  organisationName: string | null;
}

export function firstNameOf(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "";
  const first = clean.split(/[\s,]+/)[0] ?? "";
  return first.replace(/^["']|["']$/g, "");
}

function requesterFirstName(values: PlaceholderValues): string {
  const fromName = firstNameOf(values.requesterName);
  if (fromName) return fromName;
  const local = values.requesterEmail.split("@")[0] ?? "";
  return local.split(/[._-]/)[0] ?? "";
}

/** All placeholder names the desk knows, with the value they resolve to. */
export function placeholderMap(values: PlaceholderValues): Record<string, string> {
  const firstName = requesterFirstName(values);
  const requesterName = (values.requesterName ?? "").trim() || firstName;
  return {
    "ticket.number": String(values.ticketNumber),
    "requester.first_name": firstName,
    "requester.name": requesterName,
    "requester.email": values.requesterEmail,
    "agent.name": values.agentName,
    "agent.first_name": firstNameOf(values.agentName),
    "organisation.name": values.organisationName ?? "",
    "organization.name": values.organisationName ?? "",
    requester_name: requesterName,
    ticket_number: String(values.ticketNumber),
    agent_name: values.agentName,
  };
}

/** Substitutes the known placeholders; anything unknown stays as written. */
export function applyPlaceholders(text: string, values: PlaceholderValues): string {
  const map = placeholderMap(values);
  return text
    .replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (m, key: string) => {
      const k = key.toLowerCase();
      return k in map ? map[k]! : m;
    })
    .replace(/\{([a-z_]+)\}/g, (m, key: string) => {
      const k = key.toLowerCase();
      return k in map ? map[k]! : m;
    });
}

/** Placeholder names still present after substitution (shown to the operator as a hint). */
export function unresolvedPlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-z_.]+)\s*\}\}/gi)) out.add(m[1]!);
  return [...out];
}
