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

  const cardW = 280;
  const cardH = 176;
  let x = cx + 16;
  let y = cy - cardH / 2;
  if (x + cardW > w - 12) x = cx - cardW - 16;
  if (y < 12) y = 12;
  if (y + cardH > h - 12) y = h - cardH - 12;

  ctx.fillStyle = "rgba(10,14,18,0.92)";
  roundRect(ctx, x, y, cardW, cardH, 8);
  ctx.fill();
  ctx.strokeStyle = rgbCss(rgb, 1);
  ctx.lineWidth = 3;
  ctx.stroke();

  const period = cl.bpm > 0.1 ? 60 / cl.bpm : 0;
  ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#f4f6f8";
  ctx.textBaseline = "top";
  ctx.fillText(`${cl.id}  ·  ${cl.status.toUpperCase()}`, x + 12, y + 10);
  ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#c9d2dc";
  const lines = [
    `Now ${cl.bpm.toFixed(2)} /min  (${period.toFixed(1)} s/breath)`,
    `2 min avg  ${cl.avgBpm2min.toFixed(2)} /min   amp ${(cl.avgAmp2min * 100).toFixed(0)}%`,
    `Trend ${cl.trendBpmPerMin >= 0 ? "+" : ""}${cl.trendBpmPerMin.toFixed(2)} /min per min`,
    cl.secondsToLow !== null
      ? `May cross 7 /min in ${(cl.secondsToLow / 60).toFixed(1)} min`
      : "Not projected to cross 7 /min",
    cl.ampDropFrac !== null
      ? `Amplitude change ${(cl.ampDropFrac * -100).toFixed(0)}% vs ~2 min ago`
      : "Need ~2 min for amplitude drop check",
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, x + 12, y + 34 + i * 16));

  const sparkX = x + 12;
  const sparkY = y + 122;
  const sparkW = cardW - 24;
  const sparkH = 42;
  ctx.fillStyle = "#1a222c";
  ctx.fillRect(sparkX, sparkY, sparkW, sparkH);
  if (history.length >= 2) {
    const bpms = history.map((s) => s.bpm);
    const lo = Math.min(4, ...bpms);
    const hi = Math.max(30, ...bpms);
    ctx.beginPath();
    history.forEach((s, i) => {
      const px = sparkX + (i / (history.length - 1)) * sparkW;
      const py = sparkY + sparkH - ((s.bpm - lo) / (hi - lo)) * sparkH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = rgbCss(rgb, 1);
    ctx.lineWidth = 2;
    ctx.stroke();
    const y7 = sparkY + sparkH - ((7 - lo) / (hi - lo)) * sparkH;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sparkX, y7);
    ctx.lineTo(sparkX + sparkW, y7);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = "#8b98a8";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Period (cycles / min) · dashed = 7 /min", sparkX, sparkY + sparkH + 2);
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
