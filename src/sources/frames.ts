import { BreathingBay, loadSimCount } from "../sim/bay";

export interface FrameSource {
  readonly name: string;
  start(): Promise<{ width: number; height: number }>;
  stop(): void;
  grab(dst: HTMLCanvasElement): boolean;
  tick?(now: number): void;
  paint?(dst: HTMLCanvasElement): boolean;
}

const CAM_KEY = "breath-hud-camera-v1";

export function loadCameraId(): string {
  try {
    return String(JSON.parse(globalThis.localStorage?.getItem(CAM_KEY) || "{}").deviceId || "");
  } catch {
    return "";
  }
}

export function saveCameraId(deviceId: string) {
  try {
    globalThis.localStorage?.setItem(CAM_KEY, JSON.stringify({ deviceId }));
  } catch {
    /* ignore */
  }
}

export function cameraConstraints(deviceId = ""): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 15, max: 30 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = { ideal: "environment" };
  return { video, audio: false };
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "videoinput");
}

export function mediaErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") return "Permission denied.";
    if (err.name === "NotFoundError") return "No camera found.";
    if (err.name === "NotReadableError") return "Camera is already in use.";
    if (err.name === "OverconstrainedError") return "That camera mode is not available.";
  }
  return err instanceof Error ? err.message : String(err);
}

export class VideoStreamSource implements FrameSource {
  private stream: MediaStream | null = null;

  constructor(
    readonly name: string,
    private video: HTMLVideoElement,
    private open: () => Promise<MediaStream>,
  ) {}

  async start(): Promise<{ width: number; height: number }> {
    this.stream = await this.open();
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    const track = this.stream.getVideoTracks()[0];
    const settings = track?.getSettings() ?? {};
    track?.addEventListener("ended", () => this.stop());
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

export class ScreenSource extends VideoStreamSource {
  constructor(video: HTMLVideoElement) {
    super("screen", video, () =>
      navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 8, max: 15 },
        },
        audio: false,
        selfBrowserSurface: "exclude",
        preferCurrentTab: false,
      } as DisplayMediaStreamOptions),
    );
  }
}

export class CameraSource extends VideoStreamSource {
  constructor(video: HTMLVideoElement, deviceId = "") {
    super("camera", video, () => navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId)));
  }
}

/** In-HUD copy of the breathing-sim bay (same renderer as simulate.html). */
export class DemoSource implements FrameSource {
  readonly name = "demo";
  readonly bay = new BreathingBay(loadSimCount(), true);
  private running = false;

  async start(): Promise<{ width: number; height: number }> {
    this.bay.restart();
    this.running = true;
    return { width: 1920, height: 1080 };
  }

  stop() {
    this.running = false;
  }

  setCount(n: number) {
    this.bay.setCount(n);
  }

  setVary(on: boolean) {
    this.bay.vary = on;
  }

  tick(now: number) {
    if (this.running) this.bay.step(now);
  }

  paint(dst: HTMLCanvasElement): boolean {
    if (!this.running) return false;
    if (!dst.width || !dst.height) {
      dst.width = 1920;
      dst.height = 1080;
    }
    const ctx = dst.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    this.bay.draw(ctx, dst.width, dst.height);
    return true;
  }

  grab(dst: HTMLCanvasElement): boolean {
    this.tick(performance.now());
    return this.paint(dst);
  }
}
