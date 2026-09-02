import type { ReactNode } from "react";
import { Brand, Card, Container } from "@track-site/ui";
import { Link } from "@/i18n/navigation";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-12">
      <Link href="/" className="mb-6" aria-label="track.site home">
        <Brand size={36} />
      </Link>
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-3">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </Card>
      {footer ? <div className="mt-4 text-sm text-ink-3">{footer}</div> : null}
    </Container>
  );
}
