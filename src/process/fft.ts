/**
 * In-place radix-2 Cooley–Tukey FFT.
 * `real` and `imag` must be the same power-of-two length.
 */
export function fftRadix2(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n !== imag.length || n < 2 || (n & (n - 1)) !== 0) {
    throw new Error("fftRadix2 requires power-of-two real/imag buffers");
  }

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = real[i + j];
        const uIm = imag[i + j];
        const vr = real[i + j + half];
        const vi = imag[i + j + half];
        const vRe = vr * wRe - vi * wIm;
        const vIm = vr * wIm + vi * wRe;
        real[i + j] = uRe + vRe;
        imag[i + j] = uIm + vIm;
        real[i + j + half] = uRe - vRe;
        imag[i + j + half] = uIm - vIm;
        const nWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nWRe;
      }
    }
  }
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function hann(n: number, i: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
}

/** Parabolic peak interpolation around bin `k`. Returns fractional bin. */
export function interpolatePeak(mag: Float32Array, k: number): number {
  if (k <= 0 || k >= mag.length - 1) return k;
  const a = mag[k - 1];
  const b = mag[k];
  const c = mag[k + 1];
  const denom = a - 2 * b + c;
  if (Math.abs(denom) < 1e-12) return k;
  const p = (0.5 * (a - c)) / denom;
  return k + p;
}

export interface RespiratoryPeak {
  bpm: number;
  /** Peak-to-mean modulation depth of the sinusoid at the peak bin. */
  amplitude: number;
  snr: number;
  bin: number;
}

/**
 * Temporal FFT of a luminance series. Looks for a peak in the respiratory
 * band (cycles per minute), not spatial frequencies.
 */
export interface FftScratch {
  re: Float32Array;
  im: Float32Array;
  mag: Float32Array;
}

export function makeFftScratch(n: number): FftScratch {
  return {
    re: new Float32Array(n),
    im: new Float32Array(n),
    mag: new Float32Array(n / 2),
  };
}

export function windowVariance(samples: Float32Array, n: number): number {
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const d = samples[i] - mean;
    v += d * d;
  }
  return v / n;
}

export function respiratoryPeak(
  samples: Float32Array,
  sampleRate: number,
  bpmMin = 4,
  bpmMax = 40,
  scratch?: FftScratch,
): RespiratoryPeak | null {
  const n = samples.length;
  if (n < 32 || sampleRate <= 0) return null;
  if ((n & (n - 1)) !== 0) return null;

  const buf = scratch && scratch.re.length === n ? scratch : makeFftScratch(n);
  const workRe = buf.re;
  const workIm = buf.im;
  workIm.fill(0);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const w = hann(n, i);
    const v = (samples[i] - mean) * w;
    workRe[i] = v;
    energy += v * v;
  }
  if (energy < 1e-8) return null;

  fftRadix2(workRe, workIm);

  const mag = buf.mag.length === n / 2 ? buf.mag : new Float32Array(n / 2);
  for (let k = 0; k < mag.length; k++) {
    mag[k] = Math.hypot(workRe[k], workIm[k]);
  }

  const hzMin = bpmMin / 60;
  const hzMax = Math.min(bpmMax / 60, sampleRate * 0.45);
  const binMin = Math.max(1, Math.floor((hzMin * n) / sampleRate));
  const binMax = Math.min(mag.length - 2, Math.ceil((hzMax * n) / sampleRate));
  if (binMax <= binMin) return null;

  let peakK = binMin;
  let peakMag = mag[binMin];
  for (let k = binMin + 1; k <= binMax; k++) {
    if (mag[k] > peakMag) {
      peakMag = mag[k];
      peakK = k;
    }
  }

  // Median of the band excluding ±2 bins around the peak, for SNR.
  const band: number[] = [];
  for (let k = binMin; k <= binMax; k++) {
    if (Math.abs(k - peakK) <= 2) continue;
    band.push(mag[k]);
  }
  band.sort((a, b) => a - b);
  const median = band.length ? band[(band.length / 2) | 0] : 1e-9;
  const snr = peakMag / Math.max(median, 1e-9);
  if (!Number.isFinite(snr)) return null;

  const kInterp = interpolatePeak(mag, peakK);
  const hz = (kInterp * sampleRate) / n;
  const bpm = hz * 60;

  // Hann-window coherent gain ≈ 0.5; 2*|X[k]|/(N*gain) ≈ sine amplitude.
  const sineAmp = (2 * peakMag) / (n * 0.5);
  const amplitude = sineAmp / Math.max(Math.abs(mean), 1e-3);

  return { bpm, amplitude, snr, bin: peakK };
}

/** Linear regression slope of y vs x, or 0 if degenerate. */
export function slope(xs: number[], ys: number[]): number {
  const m = xs.length;
  if (m !== ys.length || m < 2) return 0;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < m; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const denom = m * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return 0;
  return (m * sxy - sx * sy) / denom;
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
