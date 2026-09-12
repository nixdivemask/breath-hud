import { describe, expect, it } from "vitest";
import { clusterCells } from "../src/process/cluster";

describe("clusterCells", () => {
  it("joins adjacent cells with a matching period", () => {
    const cols = 8;
    const rows = 4;
    const n = cols * rows;
    const bpm = new Float32Array(n);
    const amp = new Float32Array(n);
    const snr = new Float32Array(n);
    const active = new Uint8Array(n);
    for (const i of [0, 1, 8, 9]) {
      bpm[i] = 14;
      amp[i] = 0.2;
      snr[i] = 6;
      active[i] = 1;
    }
    for (const i of [6, 7, 14, 15]) {
      bpm[i] = 6.1;
      amp[i] = 0.2;
      snr[i] = 6;
      active[i] = 1;
    }
    const clusters = clusterCells(cols, rows, bpm, amp, snr, active, 1.5, 3);
    expect(clusters.length).toBe(2);
    const rates = clusters.map((c) => c.bpm).sort((a, b) => a - b);
    expect(rates[0]).toBeCloseTo(6.1, 5);
    expect(rates[1]).toBeCloseTo(14, 5);
  });
});
