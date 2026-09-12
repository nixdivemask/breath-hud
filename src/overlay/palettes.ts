import type { PaletteId } from "../types";

export type RGB = [number, number, number];

/** Sampled matplotlib / colorblind-safe LUTs, bad (0) → good (1). */
const LUTS: Record<PaletteId, string[]> = {
  cividis: [
    "#00204c",
    "#163a6d",
    "#3b4c6f",
    "#5c5d70",
    "#7b706e",
    "#9b8369",
    "#bc9a5b",
    "#dbb649",
    "#f7d13d",
    "#ffe945",
  ],
  viridis: [
    "#440154",
    "#482878",
    "#3e4989",
    "#31688e",
    "#26828e",
    "#1f9e89",
    "#35b779",
    "#6ece58",
    "#b5de2b",
    "#fde725",
  ],
  ibm: [
    "#dc267f",
    "#fe6100",
    "#ffb000",
    "#648fff",
    "#785ef0",
  ],
  okabe: [
    "#d55e00",
    "#e69f00",
    "#f0e442",
    "#009e73",
    "#0072b2",
  ],
  plasma: [
    "#0d0887",
    "#5302a3",
    "#8b0aa5",
    "#b83289",
    "#db5c68",
    "#f48849",
    "#febd2a",
    "#f0f921",
  ],
  gray: [
    "#111111",
    "#3a3a3a",
    "#6e6e6e",
    "#a6a6a6",
    "#f2f2f2",
  ],
};

export const PALETTE_LABELS: Record<PaletteId, string> = {
  cividis: "Cividis (default, color-blind designed)",
  viridis: "Viridis",
  ibm: "IBM (magenta → blue)",
  okabe: "Okabe–Ito (orange → blue)",
  plasma: "Plasma",
  gray: "Grayscale",
};

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function samplePalette(id: PaletteId, t: number): RGB {
  const stops = LUTS[id].map(hexToRgb);
  const x = Math.max(0, Math.min(1, t));
  const p = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  const f = p - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/** 256×1 RGBA palette texture. */
export function paletteTexture(id: PaletteId): Uint8ClampedArray {
  const data = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = samplePalette(id, i / 255);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return data;
}

export function contrastingText(rgb: RGB): string {
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return l > 150 ? "#111418" : "#f4f6f8";
}

export function rgbCss(rgb: RGB, a = 1): string {
  return `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;
}
