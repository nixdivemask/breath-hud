import { describe, expect, it } from "vitest";
import { BreathingBay, clampSimCount, profileTarget } from "../src/sim/bay";

describe("clampSimCount", () => {
  it("stays in 2–24", () => {
    expect(clampSimCount(1)).toBe(2);
    expect(clampSimCount(12)).toBe(12);
    expect(clampSimCount(99)).toBe(24);
    expect(clampSimCount(Number.NaN)).toBe(12);
  });
});

describe("BreathingBay", () => {
  it("builds a mixed-profile bay", () => {
    const bay = new BreathingBay(8, true);
    expect(bay.count).toBe(8);
    expect(bay.people.some((p) => p.profile === "crash")).toBe(true);
    expect(bay.people.some((p) => p.profile === "fast")).toBe(true);
  });

  it("drops crash target after 40 s", () => {
    const bay = new BreathingBay(8, true);
    const crash = bay.people.find((p) => p.profile === "crash")!;
    expect(profileTarget(crash, 10, true)).toBeGreaterThan(10);
    expect(profileTarget(crash, 120, true)).toBeLessThan(crash.base - 4);
  });
});
