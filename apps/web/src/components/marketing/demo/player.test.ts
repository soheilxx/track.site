import { describe, expect, it, vi } from "vitest";
import { createFakeClock } from "./clock";
import { createDemoPlayer } from "./player";

describe("fake clock", () => {
  it("fires timers in order when advanced and supports cancellation", () => {
    const clock = createFakeClock();
    const calls: string[] = [];
    clock.setTimeout(() => calls.push("b"), 20);
    const a = clock.setTimeout(() => calls.push("a"), 10);
    clock.setTimeout(() => calls.push("c"), 30);
    clock.clearTimeout(a);
    clock.advance(25);
    expect(calls).toEqual(["b"]);
    expect(clock.now()).toBe(25);
    expect(clock.pending()).toBe(1);
    clock.advance(5);
    expect(calls).toEqual(["b", "c"]);
  });

  it("lets a timer schedule the next one during advance", () => {
    const clock = createFakeClock();
    const calls: number[] = [];
    const tick = () => {
      calls.push(clock.now());
      clock.setTimeout(tick, 10);
    };
    clock.setTimeout(tick, 10);
    clock.advance(35);
    expect(calls).toEqual([10, 20, 30]);
  });
});

describe("demo player", () => {
  it("ticks once per interval while running and stops cleanly", () => {
    const clock = createFakeClock();
    const onTick = vi.fn();
    const player = createDemoPlayer({ clock, intervalMs: 2400, onTick });
    expect(player.running()).toBe(false);
    player.start();
    player.start();
    expect(player.running()).toBe(true);
    clock.advance(2399);
    expect(onTick).not.toHaveBeenCalled();
    clock.advance(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    clock.advance(4800);
    expect(onTick).toHaveBeenCalledTimes(3);
    player.stop();
    expect(player.running()).toBe(false);
    expect(clock.pending()).toBe(0);
    clock.advance(10_000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it("does not tick again when stopped from inside a tick", () => {
    const clock = createFakeClock();
    const player = createDemoPlayer({ clock, intervalMs: 100, onTick: () => player.stop() });
    player.start();
    clock.advance(1000);
    expect(clock.pending()).toBe(0);
    expect(player.running()).toBe(false);
  });

  it("is deterministic: the same clock steps produce the same tick count", () => {
    const runOnce = () => {
      const clock = createFakeClock();
      const onTick = vi.fn();
      const player = createDemoPlayer({ clock, intervalMs: 500, onTick });
      player.start();
      clock.advance(1250);
      player.stop();
      return onTick.mock.calls.length;
    };
    expect(runOnce()).toBe(2);
    expect(runOnce()).toBe(2);
  });
});
