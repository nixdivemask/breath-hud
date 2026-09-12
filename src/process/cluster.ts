import type { ClusterSnapshot } from "../types";

interface Raw {
  cells: number[];
  bpmSum: number;
  ampSum: number;
  snrSum: number;
  n: number;
}

/**
 * 4-connected components of cells whose periods match within `bpmMatch`.
 */
export function clusterCells(
  cols: number,
  rows: number,
  bpm: Float32Array,
  amp: Float32Array,
  snr: Float32Array,
  active: Uint8Array,
  bpmMatch: number,
  minCells: number,
): Omit<ClusterSnapshot, "id" | "status" | "score" | "trendBpmPerMin" | "secondsToLow" | "ampDropFrac" | "avgBpm2min" | "avgAmp2min" | "reason" | "history">[] {
  const n = cols * rows;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    let p = x;
    while (parent[p] !== p) p = parent[p];
    let c = x;
    while (c !== p) {
      const next = parent[c];
      parent[c] = p;
      c = next;
    }
    return p;
  };
  const unite = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };

  const similar = (i: number, j: number) =>
    active[i] &&
    active[j] &&
    Math.abs(bpm[i] - bpm[j]) <= bpmMatch;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!active[i]) continue;
      if (x + 1 < cols && similar(i, i + 1)) unite(i, i + 1);
      if (y + 1 < rows && similar(i, i + cols)) unite(i, i + cols);
    }
  }

  const groups = new Map<number, Raw>();
  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;
    const p = find(i);
    let g = groups.get(p);
    if (!g) {
      g = { cells: [], bpmSum: 0, ampSum: 0, snrSum: 0, n: 0 };
      groups.set(p, g);
    }
    g.cells.push(i);
    g.bpmSum += bpm[i];
    g.ampSum += amp[i];
    g.snrSum += snr[i];
    g.n += 1;
  }

  const out: ReturnType<typeof clusterCells> = [];
  for (const g of groups.values()) {
    if (g.n < minCells) continue;
    let sx = 0,
      sy = 0,
      minX = cols,
      minY = rows,
      maxX = 0,
      maxY = 0;
    for (const i of g.cells) {
      const x = i % cols;
      const y = (i / cols) | 0;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    out.push({
      cells: g.cells,
      cx: sx / g.n,
      cy: sy / g.n,
      minX,
      minY,
      maxX,
      maxY,
      bpm: g.bpmSum / g.n,
      amplitude: g.ampSum / g.n,
      snr: g.snrSum / g.n,
    });
  }
  return out;
}

export function matchClusters(
  prev: { id: string; cx: number; cy: number; bpm: number }[],
  next: { cx: number; cy: number; bpm: number }[],
  maxDist: number,
  bpmMatch: number,
): (string | null)[] {
  const used = new Set<number>();
  const ids: (string | null)[] = next.map(() => null);
  for (let i = 0; i < next.length; i++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < prev.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(next[i].bpm - prev[j].bpm) > bpmMatch * 2) continue;
      const dx = next[i].cx - prev[j].cx;
      const dy = next[i].cy - prev[j].cy;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0 && bestD <= maxDist) {
      used.add(best);
      ids[i] = prev[best].id;
    }
  }
  return ids;
}
