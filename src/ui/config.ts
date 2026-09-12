import { DEFAULT_CONFIG, type AppConfig, type PaletteId } from "../types";

const KEY = "breath-hud-config-v1";

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...(parsed.thresholds ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(cfg: AppConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export const PALETTE_IDS: PaletteId[] = [
  "cividis",
  "viridis",
  "ibm",
  "okabe",
  "plasma",
  "gray",
];
