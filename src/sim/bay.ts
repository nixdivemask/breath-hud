export type Profile = "stable" | "slowing" | "fast" | "crash" | "fading";
export type RGB = [number, number, number];
export type Sample = { t: number; bpm: number; amp: number };

export type Person = {
  name: string;
  profile: Profile;
  bpm: number;
  target: number;
  base: number;
  amp: number;
  amp0: number;
  phase: number;
  skin: RGB;
  shirt: RGB;
  history: Sample[];
};

const NAMES = [
  "Alex", "Sam", "Rio", "Jordan", "Casey", "Quinn", "Avery", "Drew",
  "Sage", "Rowan", "Blake", "Reese", "Skyler", "Morgan", "Parker", "Cameron",
  "Harper", "Finley", "Eden", "Remy", "Nico", "Dana", "Ellis", "Suri",
];
const SKINS: RGB[] = [
  [196, 158, 132], [168, 124, 96], [214, 184, 156], [92, 64, 48],
  [232, 198, 176], [140, 96, 72], [186, 140, 110], [120, 88, 70],
];
const SHIRTS: RGB[] = [
  [62, 92, 128], [92, 64, 58], [58, 98, 86], [110, 78, 42],
  [78, 70, 112], [48, 88, 108], [128, 72, 72], [70, 90, 70],
];
const PROFILES: Profile[] = [
  "stable", "stable", "stable", "slowing", "fast", "crash", "fading", "stable",
];

export const SIM_COUNT_KEY = "breath-hud-sim-v1";
const HISTORY_SEC = 120;

export function clampSimCount(n: number): number {
  if (!Number.isFinite(n)) return 12;
  return Math.max(2, Math.min(24, Math.round(n)));
}

export function loadSimCount(search = ""): number {
  const q = Number(new URLSearchParams(search).get("n"));
  if (q >= 2 && q <= 24) return Math.round(q);
  try {
    const raw = globalThis.localStorage?.getItem(SIM_COUNT_KEY);
    const n = Number(JSON.parse(raw || "{}").n);
    if (n >= 2 && n <= 24) return n;
  } catch {
    /* ignore */
  }
  return 12;
}

export function saveSimCount(n: number) {
  try {
    globalThis.localStorage?.setItem(SIM_COUNT_KEY, JSON.stringify({ n: clampSimCount(n) }));
  } catch {
    /* ignore */
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makePeople(n: number): Person[] {
  const count = clampSimCount(n);
  const rand = mulberry32(count * 997);
  const out: Person[] = [];
  for (let i = 0; i < count; i++) {
    const profile = PROFILES[i % PROFILES.length]!;
    let base = 14;
    if (profile === "fast") base = 26;
    if (profile === "slowing") base = 12;
    if (profile === "crash") base = 13;
    if (profile === "fading") base = 14;
    base += (rand() - 0.5) * 2;
    const amp0 = 0.48 + rand() * 0.18;
    out.push({
      name: NAMES[i % NAMES.length]!,
      profile,
      bpm: base,
      target: base,
      base,
      amp: amp0,
      amp0,
      phase: rand() * Math.PI * 2,
      skin: SKINS[i % SKINS.length]!,
      shirt: SHIRTS[i % SHIRTS.length]!,
      history: [],
    });
  }
  return out;
}

function layout(n: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(n * 1.35));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function rgb(c: RGB, s = 1): string {
  return `rgb(${(c[0] * s) | 0},${(c[1] * s) | 0},${(c[2] * s) | 0})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function profileTarget(p: Person, t: number, vary: boolean): number {
  if (!vary) return p.base;
  const slow = 0.15 * Math.sin(t / 18 + p.phase);
  switch (p.profile) {
    case "stable":
      return p.base + 1.4 * Math.sin(t / 22 + p.phase) + slow;
    case "slowing":
      return Math.max(4.2, p.base - t * (5.5 / 180) + 0.4 * Math.sin(t / 14));
    case "fast":
      return 24 + 4 * Math.sin(t / 16 + p.phase) + slow;
    case "crash":
      return t < 40 ? p.base + slow : Math.max(3.8, p.base - (t - 40) * (8 / 90));
    case "fading":
      return p.base + 0.6 * Math.sin(t / 20 + p.phase);
  }
}

export function profileAmp(p: Person, t: number, vary: boolean): number {
  if (!vary) return p.amp0;
  if (p.profile === "fading") return Math.max(0.12, p.amp0 * (1 - t / 110));
  if (p.profile === "crash" && t > 40) {
    return Math.max(0.14, p.amp0 * (1 - (t - 40) / 80));
  }
  return p.amp0 * (0.92 + 0.08 * Math.sin(t / 12 + p.phase));
}

function tag(p: Person): string {
  switch (p.profile) {
    case "slowing":
      return "slowing";
    case "fast":
      return "fast";
    case "crash":
      return "will crash";
    case "fading":
      return "amp fade";
    default:
      return "rest";
  }
}

function drawSpark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hist: Sample[],
) {
  ctx.fillStyle = "#151b24";
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  if (hist.length < 2) return;
  const lo = 0;
  const hi = 32;
  const t0 = hist[0]!.t;
  const t1 = hist[hist.length - 1]!.t;
  const yAt = (bpm: number) => y + h - ((bpm - lo) / (hi - lo)) * h;
  const xAt = (t: number) => x + ((t - t0) / (t1 - t0 || 1)) * w;

  ctx.strokeStyle = "rgba(213,94,0,0.75)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, yAt(7));
  ctx.lineTo(x + w, yAt(7));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  hist.forEach((s, i) => {
    const px = xAt(s.t);
    const py = yAt(s.bpm);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = "#56b4e9";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  p: Person,
  box: { x: number; y: number; w: number; h: number },
) {
  const breath = 0.5 + 0.5 * Math.sin(p.phase);
  const lift = breath * p.amp;
  const { x, y, w, h } = box;

  ctx.fillStyle = "#2a313c";
  roundRect(ctx, x + 4, y + h * 0.4, w - 8, h * 0.52, 10);
  ctx.fill();

  const chestW = w * 0.46;
  const chestH = h * (0.28 + lift * 0.05);
  const chestX = x + (w - chestW) / 2;
  const chestY = y + h * 0.3 - lift * h * 0.025;
  const shine = 0.52 + lift * 0.9;

  ctx.fillStyle = rgb(p.shirt, 0.5);
  roundRect(ctx, x + w * 0.22, y + h * 0.58, w * 0.16, h * 0.26, 8);
  ctx.fill();
  roundRect(ctx, x + w * 0.62, y + h * 0.58, w * 0.16, h * 0.26, 8);
  ctx.fill();

  ctx.fillStyle = rgb(p.shirt, shine);
  roundRect(ctx, chestX, chestY, chestW, chestH, 16);
  ctx.fill();

  const hx = x + w * 0.5;
  const hy = y + h * 0.22;
  const hr = Math.min(w, h) * 0.1;
  ctx.fillStyle = rgb(p.skin, 0.92);
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();

  const fs = Math.max(11, Math.min(16, w * 0.07));
  ctx.fillStyle = "#e8eef4";
  ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`${p.name}  ${p.bpm.toFixed(1)} /min`, x + w / 2, y + 4);
  ctx.fillStyle = "#8b98a8";
  ctx.font = `${Math.max(10, fs - 2)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(tag(p), x + w / 2, y + 4 + fs + 1);

  const sparkH = Math.max(28, h * 0.16);
  drawSpark(ctx, x + 10, y + h - sparkH - 8, w - 20, sparkH, p.history);
}

export class BreathingBay {
  people: Person[];
  vary: boolean;
  private lastTs = 0;
  private lastHist = 0;

  constructor(count = 12, vary = true) {
    this.people = makePeople(count);
    this.vary = vary;
  }

  get count(): number {
    return this.people.length;
  }

  setCount(n: number) {
    this.people = makePeople(n);
    this.lastTs = 0;
    this.lastHist = 0;
  }

  restart() {
    this.people = makePeople(this.people.length);
    this.lastTs = 0;
    this.lastHist = 0;
  }

  step(now: number) {
    const dt = this.lastTs ? Math.min(0.05, (now - this.lastTs) / 1000) : 0.016;
    this.lastTs = now;
    const t = now / 1000;
    for (const p of this.people) {
      p.target = profileTarget(p, t, this.vary);
      p.bpm += (p.target - p.bpm) * Math.min(1, dt * 0.7);
      p.amp = profileAmp(p, t, this.vary);
      p.phase += 2 * Math.PI * (p.bpm / 60) * dt;
    }
    if (now - this.lastHist > 250) {
      this.lastHist = now;
      for (const p of this.people) {
        p.history.push({ t: now, bpm: p.bpm, amp: p.amp });
        const cut = now - HISTORY_SEC * 1000;
        while (p.history.length && p.history[0]!.t < cut) p.history.shift();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a2230");
    g.addColorStop(1, "#0e1116");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#171b22";
    ctx.fillRect(0, h * 0.7, w, h * 0.3);

    const { cols, rows } = layout(this.people.length);
    const top = h * 0.09;
    const pad = Math.max(8, w * 0.01);
    const boxW = (w - pad * (cols + 1)) / cols;
    const boxH = (h - top - pad * (rows + 1)) / rows;
    this.people.forEach((p, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      drawPerson(ctx, p, {
        x: pad + c * (boxW + pad),
        y: top + pad + r * (boxH + pad),
        w: boxW,
        h: boxH,
      });
    });
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    this.step(now);
    this.draw(ctx, w, h);
  }
}
