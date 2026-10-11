// The solve timer (components/solve-timer.ts): time between moves, a long gap capped, a hidden tab
// not counted.
import { describe, expect, it } from "vitest";
import { GAP_MS, pause, startTimer, tick } from "~/components/solve-timer";

describe("the solve timer", () => {
  it("counts from the first move", () => {
    let t = tick(startTimer(), 1000);
    expect(t.total).toBe(0);
    t = tick(t, 4000); t = tick(t, 10_000);
    expect(t.total).toBe(9000);
  });
  it("caps a long gap: walking away isn't solving", () => {
    let t = tick(startTimer(), 0);
    t = tick(t, 10 * 60_000);
    expect(t.total).toBe(GAP_MS);
  });
  it("leaves out time in a hidden tab", () => {
    let t = tick(startTimer(), 0);
    t = tick(t, 5000);
    t = pause(t);
    t = tick(t, 500_000);   // back, much later: counting starts again from here
    t = tick(t, 503_000);
    expect(t.total).toBe(8000);
  });
});
