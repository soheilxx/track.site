import type { DemoClock } from "./clock";

/**
 * Drives the simulated stream: calls `onTick` every `intervalMs` while running. Framework-free so it
 * can be tested with a fake clock; the hook in product-demo.tsx starts/stops it depending on
 * visibility, tab state, the user's play/pause choice and `prefers-reduced-motion`.
 */
export interface DemoPlayer {
  start(): void;
  stop(): void;
  running(): boolean;
}

export function createDemoPlayer({ clock, intervalMs, onTick }: { clock: DemoClock; intervalMs: number; onTick: () => void }): DemoPlayer {
  let running = false;
  let handle: unknown = null;
  const schedule = () => {
    handle = clock.setTimeout(() => {
      handle = null;
      if (!running) return;
      onTick();
      if (running) schedule();
    }, intervalMs);
  };
  return {
    start() {
      if (running) return;
      running = true;
      schedule();
    },
    stop() {
      running = false;
      if (handle !== null) {
        clock.clearTimeout(handle);
        handle = null;
      }
    },
    running: () => running,
  };
}
