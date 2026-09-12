import { describe, expect, it } from "vitest";
import { classifyBreath } from "../src/process/classify";
import { DEFAULT_CONFIG } from "../src/types";
import type { SamplePoint } from "../src/types";

const th = DEFAULT_CONFIG.thresholds;

function hist(
  now: number,
  pts: { agoSec: number; bpm: number; amp: number }[],
): SamplePoint[] {
  return pts.map((p) => ({
    t: now - p.agoSec * 1000,
    bpm: p.bpm,
    amplitude: p.amp,
    status: "unknown",
  }));
}

describe("classifyBreath", () => {
  it("marks below 7 /min as bad", () => {
    const now = 1e9;
    const c = classifyBreath(6.2, 0.2, hist(now, [{ agoSec: 1, bpm: 6.2, amp: 0.2 }]), now, th);
    expect(c.status).toBe("bad");
    expect(c.score).toBeLessThan(0.2);
  });

  it("marks 14 /min as good", () => {
    const now = 1e9;
    const c = classifyBreath(14, 0.25, hist(now, [{ agoSec: 1, bpm: 14, amp: 0.25 }]), now, th);
    expect(c.status).toBe("good");
    expect(c.score).toBeGreaterThan(0.8);
  });

  it("marks 28 /min as concerning", () => {
    const now = 1e9;
    const c = classifyBreath(28, 0.2, hist(now, [{ agoSec: 1, bpm: 28, amp: 0.2 }]), now, th);
    expect(c.status).toBe("concerning");
  });

  it("marks a drop of more than 50% amplitude over 2 min as bad", () => {
    const now = 1e9;
    const points: { agoSec: number; bpm: number; amp: number }[] = [];
    for (let s = 5; s <= 28; s += 2) points.push({ agoSec: s, bpm: 14, amp: 0.1 });
    for (let s = 95; s <= 118; s += 2) points.push({ agoSec: s, bpm: 14, amp: 0.3 });
    const c = classifyBreath(14, 0.1, hist(now, points), now, th);
    expect(c.ampDropFrac).not.toBeNull();
    expect(c.ampDropFrac!).toBeGreaterThan(0.5);
    expect(c.status).toBe("bad");
  });

  it("marks a downward trend that would cross 7 /min as bad", () => {
    const now = 1e9;
    const points: { agoSec: number; bpm: number; amp: number }[] = [];
    // 12 /min two minutes ago, 8.5 /min now → crosses 7 in a few minutes.
    for (let s = 0; s <= 120; s += 5) {
      const bpm = 8.5 + (12 - 8.5) * (s / 120);
      points.push({ agoSec: s, bpm, amp: 0.2 });
    }
    const c = classifyBreath(8.5, 0.2, hist(now, points), now, th);
    expect(c.secondsToLow).not.toBeNull();
    expect(c.secondsToLow!).toBeLessThan(th.trendLookaheadSec);
    expect(c.status).toBe("bad");
  });
});
