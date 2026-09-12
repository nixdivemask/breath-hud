# Breath HUD

Open-source **Chromium overlay** that watches a screen (typically a CCTV / camera-wall monitor at a harm-reduction shelter), finds **clusters of pixels whose brightness oscillates at a breathing-like period**, and paints a heads-up display on top of those regions.

This is an **assistive visualization for staff**. It is **not a medical device**, not a monitor, and not a substitute for in-person checks, pulse oximetry, or existing overdose-response protocol.

## What it does

1. Captures a display or window (or runs a built-in demo feed).
2. Downsamples each frame to a coarse grid and records **luminance vs time** per cell (~8 Hz).
3. Runs a **temporal FFT** (Hann window, respiratory band 4–40 cycles/min) in a Web Worker.
4. Groups neighboring cells that share a period into **clusters**, and keeps an identity + history for each cluster (IndexedDB, local only).
5. Overlays a **WebGL shader** whose color comes from a **selectable color-blind-friendly scale**. Color encodes the combined status of:
   - **period** (cycles / min)
   - **trend** of that period (will it fall through the floor soon?)
   - **amplitude** of the cycle (and whether it collapsed)
6. When a cluster is **not** clicked, a high-contrast label shows the **rolling 2-minute average** frequency and amplitude beside the region.
7. **Click** a region for period, amplitude, trend, time-to-floor, and a sparkline. History is stored locally.

### Status rules (defaults, editable in Settings)

| Condition | Status |
|---|---|
| Period **below 7 cycles/min**, or 2-min average below 7 | **Bad** |
| Linear trend on the last 2 minutes would cross **7 /min** within 5 minutes | **Bad** |
| Mean cycle amplitude down **more than 50%** vs ~2 minutes ago | **Bad** |
| Period **above 24 /min** (too fast) | **Concerning** |
| About **10–20 /min**, none of the above | **Good** |

## Color scales

Default is **Cividis** (designed for color-vision deficiency). Also: Viridis, IBM (magenta→blue), Okabe–Ito (orange→blue), Plasma, grayscale. Pick one in Settings. **Bad is the left/dark end of the bar, good is the right/bright end.** Fast (concerning) lands in the middle of the scale.

The shader also **pulses** on bad / slowing regions so status is not hue-only.

## Run in a browser (Chromium)

Needs a recent **Chrome / Chromium / Edge** (WebGL2, `getDisplayMedia`, module workers). Firefox is not the target.

```bash
git clone https://github.com/nixdivemask/breath-hud.git
cd breath-hud
npm install
npm run dev
```

Open the printed localhost URL. **Demo feed** checks the FFT path with four synthetic chests (14 /min good, 6 /min below floor, 28 /min fast, fading amplitude). **Capture screen** then pick the monitor that shows the camera wall.

For a kiosk-style window:

```bash
chromium --app=http://127.0.0.1:5173
```

Fullscreen: button or `F`. Settings: `S`. Deselect: `Esc`.

After GitHub Pages is enabled on this repo, the same UI can be launched from the HTTPS Pages URL (screen capture requires a secure origin).

## Overlay on top of existing screens (Electron)

True always-on-top HUD, transparent except the overlay, with the HUD window excluded from capture when the OS supports it (`setContentProtection` — macOS and Windows 10 2004+):

```bash
npm install
npm run overlay:dev    # Vite + Electron
# or a production-style pack of dist/
npm run overlay
```

macOS will ask for **Screen Recording** permission. Windows: allow the picker to choose the camera-wall display, not the HUD.

Optional: Settings → *click through* so mouse hits the CCTV UI underneath. Turn that off to click clusters.

## Privacy

- FFT and storage run **in this app on this machine**.
- Video is **not uploaded**.
- Cluster time series live in **IndexedDB** in this origin. **Export JSON** if you need a file. Do not put identifying client data in the export.

## Limits (read this before floor use)

- The camera must see **chest or abdomen motion**. Blankets, backs-to-camera, heavy compression clothing, tiny distant figures, and still IR noise will miss people.
- This is **periodicity in pixels**, not airflow, not SpO2, not a heart rate.
- The FFT needs tens of seconds before the first stable period; trend and 50% amplitude-drop checks need about **two minutes** of a tracked cluster.
- Lighting flicker (50/60 Hz) is far above the respiratory band and is ignored; slow auto-gain or PTZ motion can create false periods.
- False negatives and false positives will happen. **Staff eyes stay primary.**

## Development

```bash
npm test      # FFT peak, clustering, status rules
npm run build
```

Layout: `src/process/` (FFT, classify, cluster), `src/overlay/` (shader + labels), `src/worker.ts`, `electron/` for the HUD shell.

## License

MIT. No warranty. See `LICENSE`.
