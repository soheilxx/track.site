import type { ReactNode } from "react";
import { TeamNav } from "@/components/app/team/team-nav";

/** Team & Access module frame: the sub-navigation overview · audit log; pages render their own <h1>. */
export default function TeamLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <TeamNav />
      {children}
    </div>
  );
}
