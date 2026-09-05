"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAssistant } from "./assistant-store";
import { revealTarget } from "./focus-target";
import { movesActive, pendingMoves, type WorkspaceMove } from "./workspace-moves";

/** How long a focus target is awaited after a navigation (server components stream in). */
const FOCUS_RETRY_MS = 120;
const FOCUS_RETRIES = 25;

/**
 * Executes the workspace moves (`workspace-moves.ts`) for the activity events of the assistant:
 * navigates to the dashboard page the activity concerns and reveals/focuses its target after the
 * route rendered. Each activity transition runs at most once (dedupe by run id + phase), the latest
 * move of a batch wins, and nothing runs outside a turn that started on the setup page
 * (`movesActive`: the mounted workspace or the turn's own guided mark, never the first-run flag
 * alone). Returns the id of the last executed move for the host's `data-ai-move` attribute
 * (tests, support).
 */
export function useWorkspaceMoves(): WorkspaceMove["id"] | null {
  const { chat } = useAssistant();
  const router = useRouter();
  const pathname = usePathname();
  const seen = useRef(new Set<string>());
  const pendingFocus = useRef<string | null>(null);
  const [executed, setExecuted] = useState<WorkspaceMove["id"] | null>(null);

  const reveal = useCallback((focus: string) => {
    // a setup section that is not the current wizard step falls back to the workspace itself
    if (revealTarget(focus)) return true;
    return focus.startsWith("setup-") ? revealTarget("setup-workspace") : false;
  }, []);

  useEffect(() => {
    const moves = pendingMoves(chat.activities, seen.current);
    if (!movesActive(chat) || moves.length === 0) return;
    const move = moves[moves.length - 1]!;
    setExecuted(move.id);
    if (move.href && pathname !== move.href) {
      pendingFocus.current = move.focus;
      router.push(move.href);
      return;
    }
    if (move.focus) reveal(move.focus);
  }, [chat, pathname, router, reveal]);

  // after a navigation the target is awaited briefly (the page streams in), then revealed once
  useEffect(() => {
    const focus = pendingFocus.current;
    if (!focus) return;
    pendingFocus.current = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      timer = null;
      if (reveal(focus) || ++tries >= FOCUS_RETRIES) return;
      timer = setTimeout(attempt, FOCUS_RETRY_MS);
    };
    attempt();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pathname, reveal]);

  return executed;
}
