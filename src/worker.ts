import { classifyBreath } from "./process/classify";
import { clusterCells, matchClusters } from "./process/cluster";
import { makeFftScratch, respiratoryPeak, windowVariance } from "./process/fft";
import type {
  ClusterSnapshot,
  SamplePoint,
  Thresholds,
  WorkerIn,
  WorkerOut,
  WorkerOutResult,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let cols = DEFAULT_CONFIG.cols;
let rows = DEFAULT_CONFIG.rows;
let fftSize = DEFAULT_CONFIG.fftSize;
let sampleRate = DEFAULT_CONFIG.sampleRate;
let snrThreshold = DEFAULT_CONFIG.snrThreshold;
let minClusterCells = DEFAULT_CONFIG.minClusterCells;
let bpmMatch = DEFAULT_CONFIG.bpmMatch;
let thresholds: Thresholds = { ...DEFAULT_CONFIG.thresholds };

let ring: Float32Array | null = null;
let write = 0;
let filled = 0;
let lastAnalyze = 0;
let nextId = 1;
let analyzeEveryMs = DEFAULT_CONFIG.analyzeEveryMs;

interface Tracked {
  id: string;
  cx: number;
  cy: number;
  bpm: number;
  last: number;
  history: SamplePoint[];
}

let tracks: Tracked[] = [];

function post(msg: WorkerOut, transfer?: Transferable[]) {
  ctx.postMessage(msg, transfer ?? []);
}

function initBuffers() {
  ring = new Float32Array(cols * rows * fftSize);
  write = 0;
  filled = 0;
  lastAnalyze = 0;
  tracks = [];
  nextId = 1;
}

function analyze(t: number): WorkerOutResult {
  const nCell = cols * rows;
  const bpmA = new Float32Array(nCell);
  const ampA = new Float32Array(nCell);
  const snrA = new Float32Array(nCell);
  const active = new Uint8Array(nCell);
  const series = new Float32Array(fftSize);

  if (!ring || filled < Math.min(fftSize, 128)) {
    return {
      type: "result",
      t,
      cols,
      rows,
      overlay: new Uint8ClampedArray(nCell * 4),
      clusters: [],
      filled,
      fftSize,
    };
  }

  const nUse = Math.min(filled, fftSize);
  // Use a power-of-two window of the newest samples.
  let nFft = 1;
  while (nFft * 2 <= nUse) nFft *= 2;
  if (nFft < 64) {
    return {
      type: "result",
      t,
      cols,
      rows,
      overlay: new Uint8ClampedArray(nCell * 4),
      clusters: [],
      filled,
      fftSize,
    };
  }

  const fftScratch = makeFftScratch(nFft);
  const varGate = 0.35;

  for (let c = 0; c < nCell; c++) {
    const base = c * fftSize;
    for (let i = 0; i < nFft; i++) {
      const src = (write - nFft + i + fftSize) % fftSize;
      series[i] = ring[base + src];
    }
    const window = series.subarray(0, nFft);
    if (windowVariance(window, nFft) < varGate) continue;
    const peak = respiratoryPeak(window, sampleRate, 4, 40, fftScratch);
    if (peak && peak.snr >= snrThreshold && peak.bpm >= 4 && peak.bpm <= 40) {
      bpmA[c] = peak.bpm;
      ampA[c] = peak.amplitude;
      snrA[c] = peak.snr;
      active[c] = 1;
    }
  }

  const raw = clusterCells(
    cols,
    rows,
    bpmA,
    ampA,
    snrA,
    active,
    bpmMatch,
    minClusterCells,
  );

  tracks = tracks.filter((tr) => t - tr.last < 12_000);
  const matched = matchClusters(
    tracks,
    raw,
    14,
    bpmMatch,
  );

  const clusters: ClusterSnapshot[] = [];
  for (let i = 0; i < raw.length; i++) {
    let id = matched[i];
    if (!id) {
      id = `c-${nextId++}`;
      tracks.push({
        id,
        cx: raw[i].cx,
        cy: raw[i].cy,
        bpm: raw[i].bpm,
        last: t,
        history: [],
      });
    }
    const tr = tracks.find((x) => x.id === id);
    if (!tr) continue;
    tr.cx = raw[i].cx;
    tr.cy = raw[i].cy;
    tr.bpm = raw[i].bpm;
    tr.last = t;
    tr.history.push({
      t,
      bpm: raw[i].bpm,
      amplitude: raw[i].amplitude,
      status: "unknown",
    });
    if (tr.history.length > 400) tr.history.splice(0, tr.history.length - 400);

    const cls = classifyBreath(raw[i].bpm, raw[i].amplitude, tr.history, t, thresholds);
    tr.history[tr.history.length - 1].status = cls.status;

    clusters.push({
      id,
      cells: raw[i].cells,
      cx: raw[i].cx,
      cy: raw[i].cy,
      minX: raw[i].minX,
      minY: raw[i].minY,
      maxX: raw[i].maxX,
      maxY: raw[i].maxY,
      bpm: raw[i].bpm,
      amplitude: raw[i].amplitude,
      snr: raw[i].snr,
      status: cls.status,
      score: cls.score,
      trendBpmPerMin: cls.trendBpmPerMin,
      secondsToLow: cls.secondsToLow,
      ampDropFrac: cls.ampDropFrac,
      avgBpm2min: cls.avgBpm2min,
      avgAmp2min: cls.avgAmp2min,
      reason: cls.reason,
      history: tr.history.filter((s) => t - s.t <= 120_000),
    });
  }

  const overlay = new Uint8ClampedArray(nCell * 4);
  const byCell = new Map<number, ClusterSnapshot>();
  for (const cl of clusters) {
    for (const cell of cl.cells) byCell.set(cell, cl);
  }
  for (let i = 0; i < nCell; i++) {
    const cl = byCell.get(i);
    const o = i * 4;
    if (!cl) {
      overlay[o + 3] = 0;
      continue;
    }
    overlay[o] = Math.round(cl.score * 255);
    overlay[o + 1] = Math.round(Math.max(0, Math.min(1, cl.amplitude * 4)) * 255);
    const trendN = Math.max(-2, Math.min(2, cl.trendBpmPerMin));
    overlay[o + 2] = Math.round(((trendN + 2) / 4) * 255);
    overlay[o + 3] = 255;
  }

  return {
    type: "result",
    t,
    cols,
    rows,
    overlay,
    clusters,
    filled,
    fftSize,
  };
}

ctx.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    cols = msg.cols;
    rows = msg.rows;
    fftSize = msg.fftSize;
    sampleRate = msg.sampleRate;
    snrThreshold = msg.snrThreshold;
    minClusterCells = msg.minClusterCells;
    bpmMatch = msg.bpmMatch;
    thresholds = { ...msg.thresholds };
    initBuffers();
    post({ type: "ready" });
    return;
  }
  if (msg.type === "reset") {
    initBuffers();
    return;
  }
  if (msg.type === "config") {
    if (msg.snrThreshold !== undefined) snrThreshold = msg.snrThreshold;
    if (msg.minClusterCells !== undefined) minClusterCells = msg.minClusterCells;
    if (msg.bpmMatch !== undefined) bpmMatch = msg.bpmMatch;
    if (msg.thresholds) thresholds = { ...msg.thresholds };
    return;
  }
  if (msg.type === "frame") {
    if (!ring) return;
    const lum = msg.luminance;
    const nCell = cols * rows;
    if (lum.length !== nCell) return;
    for (let c = 0; c < nCell; c++) {
      ring[c * fftSize + write] = lum[c];
    }
    write = (write + 1) % fftSize;
    filled = Math.min(filled + 1, fftSize);
    if (msg.t - lastAnalyze >= analyzeEveryMs) {
      lastAnalyze = msg.t;
      const result = analyze(msg.t);
      post(result, [result.overlay.buffer]);
    }
  }
};
