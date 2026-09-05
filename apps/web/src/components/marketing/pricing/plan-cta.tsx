"use client";

import { buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { useBillingInterval } from "./interval";
import { CONTACT_SALES_HREF, type PlanHrefs } from "./pricing-format";

export interface PlanCtaProps {
  /** signup links per interval, resolved on the server with `planHrefs()` (catalogue-validated) */
  hrefs: PlanHrefs;
  contactSales: boolean;
  recommended: boolean;
  labels: { start: string; contactSales: string };
  size: "sm" | "md";
  className?: string;
}

/**
 * Plan call to action that follows the monthly/yearly toggle (comparison matrix): the signup link
 * carries the validated plan and the currently selected interval; a contact-sales plan leads to the
 * enterprise contact form instead. Small client island so the surrounding table stays server-rendered
 * and the tariff catalogue stays out of the hydration bundle (the hrefs arrive resolved).
 */
export function PlanCta({ hrefs, contactSales, recommended, labels, size, className }: PlanCtaProps) {
  const { interval } = useBillingInterval();
  return (
    <Link href={contactSales ? CONTACT_SALES_HREF : hrefs[interval]} className={cn(buttonVariants({ variant: recommended ? "primary" : "secondary", size }), className)}>
      {contactSales ? labels.contactSales : labels.start}
    </Link>
  );
}
