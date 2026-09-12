export type StatusKind = "bad" | "concerning" | "good" | "unknown";

export type PaletteId =
  | "cividis"
  | "viridis"
  | "ibm"
  | "okabe"
  | "plasma"
  | "gray";

export interface Thresholds {
  /** Cycles per minute below this is bad. */
  lowBpm: number;
  /** Cycles per minute above this is concerning (too fast). */
  highBpm: number;
  /** Inclusive band treated as good when other checks pass. */
  goodMinBpm: number;
  goodMaxBpm: number;
  /** Amplitude drop vs ~2 min ago that counts as bad (0.5 = 50%). */
  amplitudeDrop: number;
  /** If linear trend would cross lowBpm within this many seconds, mark bad. */
  trendLookaheadSec: number;
}

export interface AppConfig {
  cols: number;
  rows: number;
  sampleRate: number;
  fftSize: number;
  analyzeEveryMs: number;
  snrThreshold: number;
  minClusterCells: number;
  bpmMatch: number;
  clusterMatchPx: number;
  clusterTimeoutMs: number;
  overlayOpacity: number;
  showLabels: boolean;
  palette: PaletteId;
  thresholds: Thresholds;
  clickThrough: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  cols: 80,
  rows: 45,
  sampleRate: 8,
  fftSize: 512,
  analyzeEveryMs: 800,
  snrThreshold: 3.2,
  minClusterCells: 6,
  bpmMatch: 1.6,
  clusterMatchPx: 48,
  clusterTimeoutMs: 8000,
  overlayOpacity: 0.55,
  showLabels: true,
  palette: "cividis",
  clickThrough: false,
  thresholds: {
    lowBpm: 7,
    highBpm: 24,
    goodMinBpm: 10,
    goodMaxBpm: 20,
    amplitudeDrop: 0.5,
    trendLookaheadSec: 5 * 60,
  },
};

export interface CellSpectrum {
  bpm: number;
  amplitude: number;
  snr: number;
}

export interface ClusterSnapshot {
  id: string;
  cells: number[];
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  bpm: number;
  amplitude: number;
  snr: number;
  status: StatusKind;
  score: number;
  trendBpmPerMin: number;
  secondsToLow: number | null;
  ampDropFrac: number | null;
  avgBpm2min: number;
  avgAmp2min: number;
  reason: string;
  history: SamplePoint[];
}

export interface SamplePoint {
  t: number;
  bpm: number;
  amplitude: number;
  status: StatusKind;
}

export interface WorkerInInit {
  type: "init";
  cols: number;
  rows: number;
  fftSize: number;
  sampleRate: number;
  snrThreshold: number;
  minClusterCells: number;
  bpmMatch: number;
  thresholds: Thresholds;
}

export interface WorkerInFrame {
  type: "frame";
  t: number;
  luminance: Float32Array;
}

export interface WorkerInConfig {
  type: "config";
  snrThreshold?: number;
  minClusterCells?: number;
  bpmMatch?: number;
  thresholds?: Thresholds;
}

export type WorkerIn = WorkerInInit | WorkerInFrame | WorkerInConfig | { type: "reset" };

export interface WorkerOutResult {
  type: "result";
  t: number;
  cols: number;
  rows: number;
  /** Packed RGBA bytes: status, amp, trend, mask. Length cols*rows*4. */
  overlay: Uint8ClampedArray;
  clusters: ClusterSnapshot[];
  filled: number;
  fftSize: number;
}

export interface WorkerOutReady {
  type: "ready";
}

export type WorkerOut = WorkerOutResult | WorkerOutReady;
