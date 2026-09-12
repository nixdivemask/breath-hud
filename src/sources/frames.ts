export interface FrameSource {
  readonly name: string;
  start(): Promise<{ width: number; height: number }>;
  stop(): void;
  grab(dst: HTMLCanvasElement): boolean;
}

export class ScreenSource implements FrameSource {
  readonly name = "screen";
  private stream: MediaStream | null = null;

  constructor(private video: HTMLVideoElement) {}

  async start(): Promise<{ width: number; height: number }> {
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 8, max: 15 },
      },
      audio: false,
      // Keep this HUD tab out of the captured frame (avoids a feedback loop).
      selfBrowserSurface: "exclude",
      preferCurrentTab: false,
    } as DisplayMediaStreamOptions);
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    const track = this.stream.getVideoTracks()[0];
    const settings = track.getSettings();
    track.addEventListener("ended", () => this.stop());
    return {
      width: settings.width || this.video.videoWidth || 1280,
      height: settings.height || this.video.videoHeight || 720,
    };
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  grab(dst: HTMLCanvasElement): boolean {
    if (!this.video.videoWidth) return false;
    if (dst.width !== this.video.videoWidth || dst.height !== this.video.videoHeight) {
      dst.width = this.video.videoWidth;
      dst.height = this.video.videoHeight;
    }
    const ctx = dst.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(this.video, 0, 0);
    return true;
  }
}

/**
 * Synthetic camera wall: three chests at 14 /min (good), 6 /min (bad),
 * 28 /min (fast), plus one whose amplitude fades.
 */
export class DemoSource implements FrameSource {
  readonly name = "demo";
  private canvas = document.createElement("canvas");
  private t0 = 0;
  private running = false;

  async start(): Promise<{ width: number; height: number }> {
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.t0 = performance.now();
    this.running = true;
    return { width: 1280, height: 720 };
  }

  stop() {
    this.running = false;
  }

  grab(dst: HTMLCanvasElement): boolean {
    if (!this.running) return false;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (dst.width !== w || dst.height !== h) {
      dst.width = w;
      dst.height = h;
    }
    const ctx = this.canvas.getContext("2d");
    const out = dst.getContext("2d", { willReadFrequently: true });
    if (!ctx || !out) return false;
    const t = (performance.now() - this.t0) / 1000;
    ctx.fillStyle = "#1a1f27";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2a3340";
    ctx.fillRect(40, 80, w - 80, h - 160);

    const patches: { x: number; bpm: number; fade: boolean; label: string }[] = [
      { x: 80, bpm: 14, fade: false, label: "14 /min  good" },
      { x: 380, bpm: 6, fade: false, label: "6 /min  below floor" },
      { x: 680, bpm: 28, fade: false, label: "28 /min  fast" },
      { x: 980, bpm: 12, fade: true, label: "12 /min  fading amp" },
    ];
    for (const p of patches) {
      const hz = p.bpm / 60;
      const fade = p.fade ? Math.max(0.15, 1 - t / 90) : 1;
      const osc = 0.5 + 0.5 * Math.sin(2 * Math.PI * hz * t);
      const v = Math.round(40 + osc * 180 * fade);
      ctx.fillStyle = `rgb(${v},${Math.round(v * 0.55)},${Math.round(v * 0.4)})`;
      ctx.fillRect(p.x, 180, 220, 320);
      ctx.fillStyle = "#d7dee8";
      ctx.font = "16px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(p.label, p.x, 160);
    }
    ctx.fillStyle = "#8b98a8";
    ctx.font = "14px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Demo feed — not a camera. Use Start screen to watch a real display.", 48, 48);
    out.drawImage(this.canvas, 0, 0);
    return true;
  }
}
