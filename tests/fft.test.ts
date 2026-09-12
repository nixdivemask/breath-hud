import { describe, expect, it } from "vitest";
import { respiratoryPeak } from "../src/process/fft";

function sine(n: number, sampleRate: number, bpm: number, mean = 120, amp = 25): Float32Array {
  const hz = bpm / 60;
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s[i] = mean + amp * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return s;
}

describe("respiratoryPeak", () => {
  it("recovers 14 breaths/min from a temporal sinusoid", () => {
    const sr = 8;
    const peak = respiratoryPeak(sine(512, sr, 14), sr);
    expect(peak).not.toBeNull();
    expect(peak!.bpm).toBeGreaterThan(13);
    expect(peak!.bpm).toBeLessThan(15);
    expect(peak!.snr).toBeGreaterThan(5);
  });

  it("recovers a slow 6 /min oscillation", () => {
    const sr = 8;
    const peak = respiratoryPeak(sine(512, sr, 6), sr);
    expect(peak).not.toBeNull();
    expect(peak!.bpm).toBeGreaterThan(5);
    expect(peak!.bpm).toBeLessThan(7);
  });

  it("returns null on a flat series", () => {
    const s = new Float32Array(512);
    s.fill(80);
    expect(respiratoryPeak(s, 8)).toBeNull();
  });
});
