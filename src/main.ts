import "./styles.css";
import { OverlayShader } from "./overlay/shader";
import { clusterAtPointer, drawDetailCard, drawLabels } from "./overlay/labels";
import { paletteTexture, PALETTE_LABELS } from "./overlay/palettes";
import { downsampleLuminance } from "./process/luminance";
import { DemoSource, ScreenSource, type FrameSource } from "./sources/frames";
import { downloadText, exportJson, upsertCluster } from "./store/indexeddb";
import type { AppConfig, ClusterSnapshot, WorkerOut } from "./types";
import { loadConfig, PALETTE_IDS, saveConfig } from "./ui/config";

declare global {
  interface Window {
    breathHud?: {
      isElectron: boolean;
      setClickThrough: (on: boolean) => void;
    };
  }
}

const preview = document.getElementById("preview") as HTMLCanvasElement;
const live = document.getElementById("live") as HTMLVideoElement;
const glCanvas = document.getElementById("gl") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLCanvasElement;
const statusLine = document.getElementById("status-line")!;
const legend = document.getElementById("legend")!;
const settingsEl = document.getElementById("settings")!;
const paletteSel = document.getElementById("palette") as HTMLSelectElement;
const opacityEl = document.getElementById("opacity") as HTMLInputElement;
const snrEl = document.getElementById("snr") as HTMLInputElement;
const lowEl = document.getElementById("low-bpm") as HTMLInputElement;
const highEl = document.getElementById("high-bpm") as HTMLInputElement;
const labelsEl = document.getElementById("labels") as HTMLInputElement;
const clickThroughEl = document.getElementById("click-through") as HTMLInputElement;

const btnDemo = document.getElementById("btn-demo") as HTMLButtonElement;
const btnSim = document.getElementById("btn-sim") as HTMLButtonElement;
const btnScreen = document.getElementById("btn-screen") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const btnFs = document.getElementById("btn-fs") as HTMLButtonElement;
const btnSettings = document.getElementById("btn-settings") as HTMLButtonElement;
const btnExport = document.getElementById("btn-export") as HTMLButtonElement;
const btnCloseSettings = document.getElementById("btn-close-settings") as HTMLButtonElement;
const captureHint = document.getElementById("capture-hint")!;
const btnDismissHint = document.getElementById("btn-dismiss-hint") as HTMLButtonElement;

const isElectron = Boolean(window.breathHud?.isElectron);
if (!isElectron) document.body.classList.add("browser");
if (isElectron) document.body.classList.add("overlay-mode");
live.hidden = true;

let cfg: AppConfig = loadConfig();
let source: FrameSource | null = null;
let worker: Worker | null = null;
let running = false;
let lastClusters: ClusterSnapshot[] = [];
let overlayBytes: Uint8ClampedArray | null = null;
let selectedId: string | null = null;
let grid = { cols: cfg.cols, rows: cfg.rows };
const lum = new Float32Array(cfg.cols * cfg.rows);
let lastFrame = 0;
const frameInterval = 1000 / cfg.sampleRate;

const shader = new OverlayShader(glCanvas);
shader.setPalette(cfg.palette);

const scratch = document.createElement("canvas");

function paintLegend() {
  const stops = paletteTexture(cfg.palette);
  const c = document.createElement("canvas");
  c.width = 120;
  c.height = 10;
  const x = c.getContext("2d")!;
  const img = x.createImageData(120, 10);
  for (let i = 0; i < 120; i++) {
    const src = Math.round((i / 119) * 255) * 4;
    for (let y = 0; y < 10; y++) {
      const o = (y * 120 + i) * 4;
      img.data[o] = stops[src];
      img.data[o + 1] = stops[src + 1];
      img.data[o + 2] = stops[src + 2];
      img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  legend.innerHTML = "";
  const imgEl = document.createElement("img");
  imgEl.src = c.toDataURL();
  imgEl.alt = "Bad to good";
  imgEl.className = "bar";
  legend.append("Bad", imgEl, "Good");
}

function fillSettings() {
  paletteSel.innerHTML = "";
  for (const id of PALETTE_IDS) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = PALETTE_LABELS[id];
    if (id === cfg.palette) o.selected = true;
    paletteSel.append(o);
  }
  opacityEl.value = String(cfg.overlayOpacity);
  snrEl.value = String(cfg.snrThreshold);
  lowEl.value = String(cfg.thresholds.lowBpm);
  highEl.value = String(cfg.thresholds.highBpm);
  labelsEl.checked = cfg.showLabels;
  clickThroughEl.checked = cfg.clickThrough;
  clickThroughEl.closest("label")!.hidden = !isElectron;
}

function applyCfg() {
  saveConfig(cfg);
  shader.setPalette(cfg.palette);
  paintLegend();
  worker?.postMessage({
    type: "config",
    snrThreshold: cfg.snrThreshold,
    minClusterCells: cfg.minClusterCells,
    bpmMatch: cfg.bpmMatch,
    thresholds: cfg.thresholds,
  });
  window.breathHud?.setClickThrough(cfg.clickThrough);
}

function resizeCanvases() {
  const stage = document.getElementById("stage")!;
  const r = stage.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * devicePixelRatio));
  const h = Math.max(1, Math.round(r.height * devicePixelRatio));
  for (const c of [preview, hud]) {
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }
  shader.resize(w, h);
}

function setStatus(text: string) {
  statusLine.textContent = text;
}

function bootWorker() {
  worker?.terminate();
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const msg = ev.data;
    if (msg.type !== "result") return;
    grid = { cols: msg.cols, rows: msg.rows };
    overlayBytes = msg.overlay;
    lastClusters = msg.clusters;
    const worst = msg.clusters.find((c) => c.status === "bad");
    const fast = msg.clusters.find((c) => c.status === "concerning");
    const n = msg.clusters.length;
    const wait = msg.filled < 64;
    if (wait) {
      setStatus(
        `Collecting motion… ${msg.filled}/${Math.min(msg.fftSize, 256)} samples. Need ~30–60 s for a stable period.`,
      );
    } else if (worst) {
      setStatus(`BAD — ${n} region(s). ${worst.id}: ${worst.reason}`);
    } else if (fast) {
      setStatus(`Concerning — ${n} region(s). ${fast.id}: ${fast.reason}`);
    } else if (n) {
      setStatus(`Tracking ${n} periodic region(s). Click a region for history.`);
    } else {
      setStatus("No periodic breathing-like motion in band 4–40 /min. Check view of chest/abdomen.");
    }
    for (const cl of msg.clusters) {
      void upsertCluster(cl, cl.history).catch(() => undefined);
    }
  };
  worker.postMessage({
    type: "init",
    cols: cfg.cols,
    rows: cfg.rows,
    fftSize: cfg.fftSize,
    sampleRate: cfg.sampleRate,
    snrThreshold: cfg.snrThreshold,
    minClusterCells: cfg.minClusterCells,
    bpmMatch: cfg.bpmMatch,
    thresholds: cfg.thresholds,
  });
}

async function start(kind: "demo" | "screen") {
  stop();
  bootWorker();
  source = kind === "demo" ? new DemoSource() : new ScreenSource(live);
  try {
    await source.start();
  } catch (err) {
    setStatus(`Capture failed: ${err instanceof Error ? err.message : String(err)}`);
    source = null;
    return;
  }
  running = true;
  btnStop.disabled = false;
  btnScreen.disabled = true;
  btnDemo.disabled = true;
  lastFrame = 0;
  document.body.classList.toggle("overlay-mode", isElectron);
  document.body.classList.toggle("live-capture", kind === "screen" && !isElectron);
  live.hidden = !(kind === "screen" && !isElectron);
  preview.classList.toggle("hidden", kind === "screen");
  if (kind === "screen" && !isElectron) {
    captureHint.hidden = false;
    setStatus(
      "Live capture is the backdrop. Prefer another display or a camera-wall window.",
    );
  } else {
    captureHint.hidden = true;
  }
  loop();
}

function stop() {
  running = false;
  source?.stop();
  source = null;
  worker?.terminate();
  worker = null;
  lastClusters = [];
  overlayBytes = null;
  selectedId = null;
  btnStop.disabled = true;
  btnScreen.disabled = false;
  btnDemo.disabled = false;
  live.hidden = true;
  live.srcObject = null;
  preview.classList.remove("hidden");
  document.body.classList.remove("live-capture");
  captureHint.hidden = true;
  if (isElectron) document.body.classList.add("overlay-mode");
  else document.body.classList.remove("overlay-mode");
  shader.clear();
  const hudCtx = hud.getContext("2d", { alpha: true });
  hudCtx?.clearRect(0, 0, hud.width, hud.height);
  setStatus("Stopped.");
}

function loop() {
  if (!running || !source) return;
  const now = performance.now();
  resizeCanvases();
  if (now - lastFrame >= frameInterval) {
    lastFrame = now;
    if (source.grab(scratch)) {
      if (source.name === "demo") {
        const p = preview.getContext("2d", { alpha: true });
        if (p) {
          p.clearRect(0, 0, preview.width, preview.height);
          const scale = Math.min(
            preview.width / scratch.width,
            preview.height / scratch.height,
          );
          const dw = scratch.width * scale;
          const dh = scratch.height * scale;
          p.drawImage(
            scratch,
            (preview.width - dw) / 2,
            (preview.height - dh) / 2,
            dw,
            dh,
          );
        }
      }
      downsampleLuminance(scratch, cfg.cols, cfg.rows, lum);
      const copy = new Float32Array(lum);
      worker?.postMessage({ type: "frame", t: now, luminance: copy }, [copy.buffer]);
    }
  }
  if (overlayBytes) {
    shader.draw(
      overlayBytes,
      grid.cols,
      grid.rows,
      cfg.overlayOpacity,
      now / 1000,
    );
  } else {
    shader.clear();
  }
  const hctx = hud.getContext("2d", { alpha: true });
  if (hctx) {
    if (cfg.showLabels) {
      drawLabels(hctx, lastClusters, grid.cols, grid.rows, cfg.palette, selectedId);
    } else {
      hctx.clearRect(0, 0, hud.width, hud.height);
    }
    const selected = lastClusters.find((c) => c.id === selectedId);
    if (selected) {
      drawDetailCard(
        hctx,
        selected,
        grid.cols,
        grid.rows,
        cfg.palette,
        selected.history.map((s) => ({ t: s.t, bpm: s.bpm, amplitude: s.amplitude })),
      );
    }
  }
  requestAnimationFrame(loop);
}

hud.addEventListener("click", (ev) => {
  const hit = clusterAtPointer(
    lastClusters,
    grid.cols,
    grid.rows,
    hud,
    ev.clientX,
    ev.clientY,
  );
  selectedId = hit ? hit.id : null;
});

window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") selectedId = null;
  if (ev.key === "f" || ev.key === "F") void document.documentElement.requestFullscreen?.();
  if (ev.key === "s" || ev.key === "S") settingsEl.hidden = !settingsEl.hidden;
});

btnSim.addEventListener("click", () => {
  const url = new URL("simulate.html", window.location.href).href;
  window.open(url, "breath-sim", "popup=yes,width=1400,height=800");
});
btnDemo.addEventListener("click", () => void start("demo"));
btnScreen.addEventListener("click", () => void start("screen"));
btnStop.addEventListener("click", stop);
btnFs.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
});
btnSettings.addEventListener("click", () => {
  settingsEl.hidden = !settingsEl.hidden;
});
btnCloseSettings.addEventListener("click", () => {
  settingsEl.hidden = true;
});
btnDismissHint.addEventListener("click", () => {
  captureHint.hidden = true;
});
btnExport.addEventListener("click", () => {
  void exportJson().then((text) =>
    downloadText(`breath-hud-${new Date().toISOString().slice(0, 10)}.json`, text),
  );
});

paletteSel.addEventListener("change", () => {
  cfg.palette = paletteSel.value as AppConfig["palette"];
  applyCfg();
});
opacityEl.addEventListener("input", () => {
  cfg.overlayOpacity = Number(opacityEl.value);
  applyCfg();
});
snrEl.addEventListener("input", () => {
  cfg.snrThreshold = Number(snrEl.value);
  applyCfg();
});
lowEl.addEventListener("change", () => {
  cfg.thresholds.lowBpm = Number(lowEl.value);
  applyCfg();
});
highEl.addEventListener("change", () => {
  cfg.thresholds.highBpm = Number(highEl.value);
  applyCfg();
});
labelsEl.addEventListener("change", () => {
  cfg.showLabels = labelsEl.checked;
  applyCfg();
});
clickThroughEl.addEventListener("change", () => {
  cfg.clickThrough = clickThroughEl.checked;
  applyCfg();
});

fillSettings();
applyCfg();
resizeCanvases();
window.addEventListener("resize", resizeCanvases);
setStatus(
  isElectron
    ? "Glass overlay ready — you should see the desktop through this window. Capture the camera-wall display; this overlay is excluded from the capture."
    : "Capture a camera-wall window or another display. Entire Screen of this monitor will look grey in a browser tab (the tab cannot be see-through). Use npm run overlay for a glass HUD on the same screen.",
);
