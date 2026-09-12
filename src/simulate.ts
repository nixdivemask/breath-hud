import "./simulate.css";
import { BreathingBay, clampSimCount, loadSimCount, saveSimCount } from "./sim/bay";

const canvas = document.getElementById("room") as HTMLCanvasElement;
const btnFs = document.getElementById("btn-fs") as HTMLButtonElement;
const countEl = document.getElementById("count") as HTMLInputElement;
const varyEl = document.getElementById("vary") as HTMLInputElement;

const bay = new BreathingBay(loadSimCount(location.search), true);
countEl.value = String(bay.count);

function resize() {
  const dpr = Math.max(1, devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}

function frame(now: number) {
  bay.vary = varyEl.checked;
  const ctx = canvas.getContext("2d");
  if (ctx) bay.render(ctx, canvas.width, canvas.height, now);
  requestAnimationFrame(frame);
}

function toggleFs() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

countEl.addEventListener("change", () => {
  const n = clampSimCount(Number(countEl.value) || 12);
  countEl.value = String(n);
  saveSimCount(n);
  bay.setCount(n);
});
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
