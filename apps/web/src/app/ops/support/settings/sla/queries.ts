import "server-only";
import { asc, count, desc, eq, ne } from "drizzle-orm";
import { supportSlaPolicies, supportTickets, user, type SlaPriorityTargets, type SupportBusinessHours } from "@track-site/db";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";
import { escalationSettings, type SlaEscalationSettings } from "@/server/support/sla";

/**
 * Loaders of the SLA policy editor (admin, `platform.sla.manage`; the pages check before calling).
 * Metadata only: policy settings, how many tickets reference a policy, and the platform operators an
 * admin may name as escalation recipients (name, e-mail, role — admins see platform users anyway).
 */
export interface SlaPolicyView {
  id: string;
  name: string;
  description: string;
  planIds: string[] | null;
  isDefault: boolean;
  priorities: SlaPriorityTargets;
  businessHours: SupportBusinessHours;
  escalation: SlaEscalationSettings;
  /** tickets referencing the policy (all states) */
  ticketCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformUserOption {
  id: string;
  name: string;
  email: string;
  platformRole: string;
}

type Row = typeof supportSlaPolicies.$inferSelect;

function view(row: Row, ticketCount: number): SlaPolicyView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    planIds: row.planIds,
    isDefault: row.isDefault,
    priorities: row.priorities,
    businessHours: row.businessHours,
    escalation: escalationSettings(row.escalation),
    ticketCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every policy, the default first, then by name; with the number of tickets referencing each. */
export async function listSlaPolicies(ctx: PlatformContext): Promise<SlaPolicyView[]> {
  return withPlatform(ctx, async (tx) => {
    const rows = await tx.select().from(supportSlaPolicies).orderBy(desc(supportSlaPolicies.isDefault), asc(supportSlaPolicies.name));
    const counts = await tx.select({ policyId: supportTickets.slaPolicyId, count: count() }).from(supportTickets).groupBy(supportTickets.slaPolicyId);
    const byPolicy = new Map(counts.map((c) => [c.policyId, Number(c.count)]));
    return rows.map((row) => view(row, byPolicy.get(row.id) ?? 0));
  });
}

export async function loadSlaPolicy(ctx: PlatformContext, id: string): Promise<SlaPolicyView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withPlatform(ctx, async (tx) => {
    const [row] = await tx.select().from(supportSlaPolicies).where(eq(supportSlaPolicies.id, id)).limit(1);
    if (!row) return null;
    const [usage] = await tx.select({ count: count() }).from(supportTickets).where(eq(supportTickets.slaPolicyId, row.id));
    return view(row, Number(usage?.count ?? 0));
  });
}

/** Platform operators (support and admin) selectable as escalation recipients. */
export async function listPlatformUsers(ctx: PlatformContext): Promise<PlatformUserOption[]> {
  return withPlatform(ctx, (tx) =>
    tx
      .select({ id: user.id, name: user.name, email: user.email, platformRole: user.platformRole })
      .from(user)
      .where(ne(user.platformRole, "NONE"))
      .orderBy(asc(user.name), asc(user.email)),
  );
}
