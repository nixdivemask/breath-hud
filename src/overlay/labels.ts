import { contrastingText, rgbCss, samplePalette } from "./palettes";
import type { ClusterSnapshot, PaletteId } from "../types";

export function hitCluster(
  clusters: ClusterSnapshot[],
  cols: number,
  rows: number,
  nx: number,
  ny: number,
): ClusterSnapshot | null {
  const x = Math.min(cols - 1, Math.max(0, Math.floor(nx * cols)));
  const y = Math.min(rows - 1, Math.max(0, Math.floor(ny * rows)));
  const i = y * cols + x;
  for (let c = clusters.length - 1; c >= 0; c--) {
    if (clusters[c].cells.includes(i)) return clusters[c];
  }
  return null;
}

function strokeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  stroke: string,
) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function drawLabels(
  ctx: CanvasRenderingContext2D,
  clusters: ClusterSnapshot[],
  cols: number,
  rows: number,
  palette: PaletteId,
  selectedId: string | null,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const placed: { x: number; y: number; w: number; h: number }[] = [];

  for (const cl of clusters) {
    const rgb = samplePalette(palette, cl.score);
    const fill = contrastingText(rgb);
    const stroke = fill === "#f4f6f8" ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.72)";
    const cx = ((cl.cx + 0.5) / cols) * w;
    const cy = ((cl.cy + 0.5) / rows) * h;
    const periodSec = cl.bpm > 0.1 ? 60 / cl.bpm : 0;
    const line1 = `${cl.avgBpm2min.toFixed(1)} /min`;
    const line2 = `amp ${(cl.avgAmp2min * 100).toFixed(0)}% · ${periodSec.toFixed(1)} s`;
    const text = selectedId === cl.id ? "" : `${line1}  ${line2}`;

    if (cl.status === "bad") {
      ctx.strokeStyle = rgbCss(rgb, 0.95);
      ctx.lineWidth = 2;
      const x0 = (cl.minX / cols) * w;
      const y0 = (cl.minY / rows) * h;
      const x1 = ((cl.maxX + 1) / cols) * w;
      const y1 = ((cl.maxY + 1) / rows) * h;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }

    if (!text) continue;

    const tw = ctx.measureText(text).width + 10;
    const th = 20;
    let lx = cx + 10;
    let ly = cy - 8;
    if (lx + tw > w - 8) lx = cx - tw - 10;
    if (ly < 8) ly = cy + 12;
    for (const p of placed) {
      if (lx < p.x + p.w && lx + tw > p.x && ly < p.y + p.h && ly + th > p.y) {
        ly = p.y + p.h + 4;
      }
    }
    placed.push({ x: lx, y: ly, w: tw, h: th });

    ctx.fillStyle = rgbCss(rgb, 0.88);
    roundRect(ctx, lx - 4, ly - 3, tw, th, 4);
    ctx.fill();
    strokeText(ctx, text, lx, ly, fill, stroke);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLineChart(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  pts: { t: number; v: number }[],
  opts: {
    yMin: number;
    yMax: number;
    color: string;
    yTicks: number[];
    guides?: { y: number; color: string; dash?: boolean; label: string }[];
    yUnit: string;
    title: string;
  },
) {
  const { x, y, w, h } = box;
  ctx.fillStyle = "#121820";
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();

  ctx.fillStyle = "#8b98a8";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(opts.title, x + 8, y + 4);

  const padL = 28;
  const padB = 16;
  const padT = 20;
  const padR = 8;
  const px0 = x + padL;
  const py0 = y + padT;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  const span = opts.yMax - opts.yMin || 1;
  const yAt = (v: number) => py0 + ph - ((v - opts.yMin) / span) * ph;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6b7785";
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of opts.yTicks) {
    const yy = yAt(tick);
    ctx.beginPath();
    ctx.moveTo(px0, yy);
    ctx.lineTo(px0 + pw, yy);
    ctx.stroke();
    ctx.fillText(String(tick), px0 - 4, yy);
  }

  for (const g of opts.guides ?? []) {
    const yy = yAt(g.y);
    ctx.strokeStyle = g.color;
    ctx.setLineDash(g.dash ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(px0, yy);
    ctx.lineTo(px0 + pw, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = g.color;
    ctx.textAlign = "left";
    ctx.fillText(g.label, px0 + 4, yy - 7);
  }

  if (pts.length >= 2) {
    const t0 = pts[0]!.t;
    const t1 = pts[pts.length - 1]!.t;
    const xAt = (t: number) => px0 + ((t - t0) / (t1 - t0 || 1)) * pw;
    ctx.beginPath();
    ctx.moveTo(xAt(pts[0]!.t), yAt(pts[0]!.v));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(xAt(pts[i]!.t), yAt(pts[i]!.v));
    }
    ctx.lineTo(xAt(pts[pts.length - 1]!.t), py0 + ph);
    ctx.lineTo(xAt(pts[0]!.t), py0 + ph);
    ctx.closePath();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = opts.color;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = xAt(p.t);
      const py = yAt(p.v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = "#6b7785";
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("2 min", x + w - 8, y + h - 3);
  ctx.textAlign = "left";
  ctx.fillText(opts.yUnit, x + 8, y + h - 3);
}

export function drawDetailCard(
  ctx: CanvasRenderingContext2D,
  cl: ClusterSnapshot,
  cols: number,
  rows: number,
  palette: PaletteId,
  history: { t: number; bpm: number; amplitude: number }[],
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const rgb = samplePalette(palette, cl.score);
  const cx = ((cl.cx + 0.5) / cols) * w;
  const cy = ((cl.cy + 0.5) / rows) * h;

  const cardW = 360;
  const cardH = 292;
  let x = cx + 16;
  let y = cy - cardH / 2;
  if (x + cardW > w - 12) x = cx - cardW - 16;
  if (y < 12) y = 12;
  if (y + cardH > h - 12) y = h - cardH - 12;

  ctx.fillStyle = "rgba(10,14,18,0.94)";
  roundRect(ctx, x, y, cardW, cardH, 8);
  ctx.fill();
  ctx.strokeStyle = rgbCss(rgb, 1);
  ctx.lineWidth = 3;
  ctx.stroke();

  const period = cl.bpm > 0.1 ? 60 / cl.bpm : 0;
  ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#f4f6f8";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${cl.id}  ·  ${cl.status.toUpperCase()}`, x + 12, y + 10);
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#c9d2dc";
  const trend = `${cl.trendBpmPerMin >= 0 ? "+" : ""}${cl.trendBpmPerMin.toFixed(2)} /min per min`;
  const extra =
    cl.secondsToLow !== null
      ? `  ·  7 /min in ${(cl.secondsToLow / 60).toFixed(1)} min`
      : "";
  ctx.fillText(
    `${cl.bpm.toFixed(1)} /min (${period.toFixed(1)} s)  ·  amp ${(cl.amplitude * 100).toFixed(0)}%  ·  ${trend}${extra}`,
    x + 12,
    y + 30,
  );

  const chartW = cardW - 24;
  drawLineChart(
    ctx,
    { x: x + 12, y: y + 50, w: chartW, h: 108 },
    history.map((s) => ({ t: s.t, v: s.bpm })),
    {
      yMin: 0,
      yMax: 32,
      color: rgbCss(rgb, 1),
      yTicks: [0, 7, 16, 24, 32],
      guides: [{ y: 7, color: "rgba(213,94,0,0.85)", dash: true, label: "7 /min" }],
      yUnit: "breaths / min",
      title: "Rate  (rolling 2 min)",
    },
  );
  const amps = history.map((s) => s.amplitude * 100);
  const aMax = Math.max(20, ...amps, cl.avgAmp2min * 100 * 1.2);
  const half = cl.avgAmp2min > 0 ? cl.avgAmp2min * 50 : 0;
  drawLineChart(
    ctx,
    { x: x + 12, y: y + 166, w: chartW, h: 108 },
    history.map((s) => ({ t: s.t, v: s.amplitude * 100 })),
    {
      yMin: 0,
      yMax: aMax,
      color: "#56b4e9",
      yTicks: [0, Math.round(aMax / 2), Math.round(aMax)],
      guides: half
        ? [{ y: half, color: "rgba(230,159,0,0.85)", dash: true, label: "50% of 2 min mean" }]
        : [],
      yUnit: "amplitude %",
      title: "Amplitude  (rolling 2 min)",
    },
  );
}

export function clusterAtPointer(
  clusters: ClusterSnapshot[],
  cols: number,
  rows: number,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): ClusterSnapshot | null {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
  return hitCluster(clusters, cols, rows, nx, ny);
}
