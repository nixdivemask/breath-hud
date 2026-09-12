import type { SamplePoint, StatusKind, Thresholds } from "../types";
import { mean, slope } from "./fft";

export interface Classification {
  status: StatusKind;
  score: number;
  reason: string;
  trendBpmPerMin: number;
  secondsToLow: number | null;
  ampDropFrac: number | null;
  avgBpm2min: number;
  avgAmp2min: number;
}

const WINDOW_MS = 120_000;

export function classifyBreath(
  bpm: number,
  amplitude: number,
  history: SamplePoint[],
  now: number,
  th: Thresholds,
): Classification {
  const recent = history.filter((s) => now - s.t <= WINDOW_MS);
  const bpms = recent.map((s) => s.bpm);
  const amps = recent.map((s) => s.amplitude);
  const avgBpm2min = bpms.length ? mean(bpms) : bpm;
  const avgAmp2min = amps.length ? mean(amps) : amplitude;

  const xs = recent.map((s) => (s.t - now) / 1000);
  const trendPerSec = slope(xs, recent.map((s) => s.bpm));
  const trendBpmPerMin = trendPerSec * 60;

  let secondsToLow: number | null = null;
  if (trendPerSec < -1e-5 && avgBpm2min > th.lowBpm) {
    const t = (th.lowBpm - avgBpm2min) / trendPerSec;
    if (t > 0) secondsToLow = t;
  }

  let ampDropFrac: number | null = null;
  const baseline = recent.filter((s) => now - s.t >= 90_000 && now - s.t <= WINDOW_MS);
  const current = recent.filter((s) => now - s.t <= 30_000);
  if (baseline.length >= 4 && current.length >= 4) {
    const b = mean(baseline.map((s) => s.amplitude));
    const c = mean(current.map((s) => s.amplitude));
    if (b > 1e-6) ampDropFrac = 1 - c / b;
  }

  const reasons: string[] = [];
  let status: StatusKind = "good";
  let score = 1;

  if (!Number.isFinite(bpm) || bpm <= 0) {
    return {
      status: "unknown",
      score: 0.5,
      reason: "No stable period yet",
      trendBpmPerMin,
      secondsToLow,
      ampDropFrac,
      avgBpm2min,
      avgAmp2min,
    };
  }

  if (bpm < th.lowBpm || avgBpm2min < th.lowBpm) {
    status = "bad";
    score = 0;
    reasons.push(`Period ${bpm.toFixed(1)} /min is below ${th.lowBpm} /min`);
  } else if (
    secondsToLow !== null &&
    secondsToLow <= th.trendLookaheadSec
  ) {
    status = "bad";
    score = 0.12;
    const mins = secondsToLow / 60;
    reasons.push(
      `Slowing toward ${th.lowBpm} /min (about ${mins.toFixed(1)} min at current trend)`,
    );
  }

  if (ampDropFrac !== null && ampDropFrac >= th.amplitudeDrop) {
    status = "bad";
    score = Math.min(score, 0.08);
    reasons.push(
      `Cycle amplitude down ${(ampDropFrac * 100).toFixed(0)}% over ~2 min`,
    );
  }

  if (status !== "bad") {
    if (bpm > th.highBpm || avgBpm2min > th.highBpm) {
      status = "concerning";
      const span = Math.max(th.highBpm, bpm) - th.goodMaxBpm;
      const over = Math.max(0, bpm - th.goodMaxBpm);
      score = 0.45 - 0.2 * Math.min(1, span > 0 ? over / Math.max(span, 1) : 1);
      reasons.push(`Breathing is fast (${bpm.toFixed(1)} /min)`);
    } else if (bpm >= th.goodMinBpm && bpm <= th.goodMaxBpm) {
      status = "good";
      score = 1;
      reasons.push("In the normal rest range");
    } else if (bpm >= th.lowBpm && bpm < th.goodMinBpm) {
      status = "concerning";
      score = 0.55 + 0.25 * ((bpm - th.lowBpm) / Math.max(th.goodMinBpm - th.lowBpm, 0.1));
      reasons.push("Slower than typical rest, still above the hard floor");
    } else {
      status = "concerning";
      score = 0.62;
      reasons.push("Outside the typical rest band");
    }
  }

  return {
    status,
    score: Math.max(0, Math.min(1, score)),
    reason: reasons.join(". ") || "Tracking",
    trendBpmPerMin,
    secondsToLow,
    ampDropFrac,
    avgBpm2min,
    avgAmp2min,
  };
}

export function statusLabel(kind: StatusKind): string {
  switch (kind) {
    case "bad":
      return "Bad";
    case "concerning":
      return "Concerning";
    case "good":
      return "Good";
    default:
      return "Unknown";
  }
}
