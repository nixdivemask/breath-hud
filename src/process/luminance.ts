function lumAt(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): number {
  const i = (y * width + x) * 4;
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

/** Box-average luminance onto a coarse grid. */
export function downsampleLuminance(
  src: HTMLCanvasElement,
  cols: number,
  rows: number,
  out: Float32Array,
): void {
  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d");
  const { width, height } = src;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const cw = width / cols;
  const ch = height / rows;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x0 = (gx * cw) | 0;
      const y0 = (gy * ch) | 0;
      const x1 = Math.min(width, ((gx + 1) * cw) | 0);
      const y1 = Math.min(height, ((gy + 1) * ch) | 0);
      let s = 0;
      let n = 0;
      const stepX = Math.max(1, ((x1 - x0) / 4) | 0);
      const stepY = Math.max(1, ((y1 - y0) / 4) | 0);
      for (let y = y0; y < y1; y += stepY) {
        for (let x = x0; x < x1; x += stepX) {
          s += lumAt(data, width, x, y);
          n++;
        }
      }
      out[gy * cols + gx] = n ? s / n : 0;
    }
  }
}
