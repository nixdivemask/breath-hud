import "./simulate.css";

const canvas = document.getElementById("room") as HTMLCanvasElement;
const btnFs = document.getElementById("btn-fs") as HTMLButtonElement;

type Person = {
  name: string;
  bpm: number;
  /** 0–1 extra brightness swing on the chest. */
  amp: number;
  phase: number;
  skin: [number, number, number];
  shirt: [number, number, number];
};

const people: Person[] = [
  {
    name: "Alex",
    bpm: 14,
    amp: 0.55,
    phase: 0.4,
    skin: [196, 158, 132],
    shirt: [62, 92, 128],
  },
  {
    name: "Sam",
    bpm: 6,
    amp: 0.5,
    phase: 1.1,
    skin: [168, 124, 96],
    shirt: [92, 64, 58],
  },
];

function resize() {
  const dpr = Math.max(1, devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}

function rgb(c: [number, number, number], s = 1): string {
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

function drawPerson(
  ctx: CanvasRenderingContext2D,
  p: Person,
  box: { x: number; y: number; w: number; h: number },
  t: number,
) {
  const breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * (p.bpm / 60) * t + p.phase);
  const lift = breath * p.amp;
  const { x, y, w, h } = box;

  // Cot
  ctx.fillStyle = "#2a313c";
  roundRect(ctx, x, y + h * 0.42, w, h * 0.5, 18);
  ctx.fill();
  ctx.fillStyle = "#3a4452";
  roundRect(ctx, x + w * 0.06, y + h * 0.48, w * 0.88, h * 0.18, 10);
  ctx.fill();

  const chestW = w * 0.42;
  const chestH = h * (0.34 + lift * 0.06);
  const chestX = x + w * 0.29;
  const chestY = y + h * 0.28 - lift * h * 0.03;
  const shine = 0.55 + lift * 0.85;

  // Legs (static)
  ctx.fillStyle = rgb(p.shirt, 0.55);
  roundRect(ctx, x + w * 0.22, y + h * 0.58, w * 0.18, h * 0.28, 14);
  ctx.fill();
  roundRect(ctx, x + w * 0.58, y + h * 0.58, w * 0.18, h * 0.28, 14);
  ctx.fill();

  // Torso — this is the oscillating region the HUD should lock onto
  ctx.fillStyle = rgb(p.shirt, shine);
  roundRect(ctx, chestX, chestY, chestW, chestH, 28);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.06 + lift * 0.12})`;
  roundRect(ctx, chestX + chestW * 0.12, chestY + 8, chestW * 0.76, chestH * 0.28, 16);
  ctx.fill();

  // Head
  const hx = x + w * 0.5;
  const hy = y + h * 0.22;
  const hr = w * 0.11;
  ctx.fillStyle = rgb(p.skin, 0.92);
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(20,16,14,0.55)";
  ctx.beginPath();
  ctx.ellipse(hx, hy - hr * 0.15, hr * 0.95, hr * 0.55, 0, Math.PI, 0, true);
  ctx.fill();

  // Arms
  ctx.strokeStyle = rgb(p.shirt, 0.7);
  ctx.lineWidth = w * 0.055;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(chestX + 8, chestY + chestH * 0.25);
  ctx.lineTo(x + w * 0.12, y + h * 0.55);
  ctx.moveTo(chestX + chestW - 8, chestY + chestH * 0.25);
  ctx.lineTo(x + w * 0.88, y + h * 0.55);
  ctx.stroke();

  ctx.fillStyle = "#d7dee8";
  ctx.font = `600 ${Math.max(14, w * 0.045)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${p.name}  ·  ${p.bpm} /min`, x + w / 2, y + h * 0.14);
  ctx.font = `${Math.max(12, w * 0.032)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "#8b98a8";
  ctx.fillText(p.bpm < 7 ? "slow (should read bad)" : "rest (should read good)", x + w / 2, y + h * 0.19);
}

function frame(now: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const t = now / 1000;

  ctx.fillStyle = "#12151c";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1a2230");
  g.addColorStop(1, "#0e1116");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Floor
  ctx.fillStyle = "#171b22";
  ctx.fillRect(0, h * 0.62, w, h * 0.38);

  const pad = w * 0.04;
  const boxW = (w - pad * 3) / 2;
  const boxH = h * 0.72;
  const boxY = h * 0.18;
  people.forEach((p, i) => {
    drawPerson(ctx, p, { x: pad + i * (boxW + pad), y: boxY, w: boxW, h: boxH }, t);
  });

  requestAnimationFrame(frame);
}

function toggleFs() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

btnFs.addEventListener("click", toggleFs);
window.addEventListener("keydown", (ev) => {
  if (ev.key === "f" || ev.key === "F") toggleFs();
});
document.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("fs", Boolean(document.fullscreenElement));
});

resize();
window.addEventListener("resize", resize);
requestAnimationFrame(frame);
