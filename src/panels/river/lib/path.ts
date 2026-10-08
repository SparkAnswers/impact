import type { PathPreset, Waypoint } from '../types';

export interface Point {
  x: number;
  y: number;
}

/** Resampled centreline in CSS pixel space. */
export interface Centreline {
  X: Float32Array;
  Y: Float32Array;
  TX: Float32Array;
  TY: Float32Array;
  /** Cumulative arc length per sample (monotonic, starts at 0). */
  S: Float32Array;
  /** Number of samples. */
  M: number;
  /** Total length in px. */
  L: number;
}

export const PATH_PRESETS: Record<PathPreset, Waypoint[]> = {
  horizontal: [
    { x: 0.03, y: 0.5 },
    { x: 0.35, y: 0.5 },
    { x: 0.65, y: 0.5 },
    { x: 0.97, y: 0.5 },
  ],
  scurve: [
    { x: 0.03, y: 0.8 },
    { x: 0.18, y: 0.79 },
    { x: 0.34, y: 0.72 },
    { x: 0.48, y: 0.62 },
    { x: 0.58, y: 0.5 },
    { x: 0.66, y: 0.37 },
    { x: 0.76, y: 0.27 },
    { x: 0.88, y: 0.22 },
    { x: 0.99, y: 0.18 },
  ],
  diagonal: [
    { x: 0.05, y: 0.9 },
    { x: 0.35, y: 0.65 },
    { x: 0.65, y: 0.35 },
    { x: 0.95, y: 0.1 },
  ],
  u: [
    { x: 0.08, y: 0.15 },
    { x: 0.1, y: 0.5 },
    { x: 0.25, y: 0.82 },
    { x: 0.5, y: 0.9 },
    { x: 0.75, y: 0.82 },
    { x: 0.9, y: 0.5 },
    { x: 0.92, y: 0.15 },
  ],
};

export function presetWaypoints(preset: PathPreset): Waypoint[] {
  return PATH_PRESETS[preset].map((p) => ({ ...p }));
}

/** Catmull-Rom spline through the points (open), roughly n samples. */
export function catmullRom(pts: Point[], n: number): Point[] {
  if (pts.length === 0) {
    return [];
  }
  if (pts.length === 1) {
    return [{ ...pts[0] }, { ...pts[0] }];
  }
  const out: Point[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const seg = Math.max(2, Math.ceil(n / (pts.length - 1)));
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

/**
 * Builds an arc-length resampled centreline from normalised waypoints.
 * Samples are evenly spaced along the curve so that index/(M-1) == fraction of length.
 */
export function buildCentreline(waypoints: Waypoint[], width: number, height: number, samples = 600): Centreline {
  const M = Math.max(2, samples | 0);
  const pts = catmullRom(
    waypoints.map((p) => ({ x: p.x * width, y: p.y * height })),
    M
  );
  const X = new Float32Array(M);
  const Y = new Float32Array(M);
  const TX = new Float32Array(M);
  const TY = new Float32Array(M);
  const S = new Float32Array(M);
  if (pts.length < 2) {
    return { X, Y, TX, TY, S, M, L: 0 };
  }
  const n = pts.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const L = cum[n - 1];
  let j = 0;
  for (let i = 0; i < M; i++) {
    const d = (i / (M - 1)) * L;
    while (j < n - 2 && cum[j + 1] < d) {
      j++;
    }
    const segLen = cum[j + 1] - cum[j];
    const f = segLen > 0 ? (d - cum[j]) / segLen : 0;
    X[i] = pts[j].x + (pts[j + 1].x - pts[j].x) * f;
    Y[i] = pts[j].y + (pts[j + 1].y - pts[j].y) * f;
    S[i] = d;
  }
  for (let i = 0; i < M; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(M - 1, i + 2);
    const dx = X[b] - X[a];
    const dy = Y[b] - Y[a];
    const l = Math.hypot(dx, dy) || 1;
    TX[i] = dx / l;
    TY[i] = dy / l;
  }
  return { X, Y, TX, TY, S, M, L };
}

/** Cosine-smoothed sample of a value series at normalised position s (0..1). */
export function smoothSample(arr: ArrayLike<number>, s: number): number {
  if (arr.length === 0) {
    return 0;
  }
  if (arr.length === 1) {
    return arr[0];
  }
  const n = arr.length - 1;
  const x = Math.max(0, Math.min(n, s * n));
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const m = (1 - Math.cos(f * Math.PI)) / 2;
  return arr[i] * (1 - m) + arr[i + 1] * m;
}

/** Effective smoothing window: explicit value, or ~5% of the sample count (min 3). */
export function autoWindow(length: number, requested = 0): number {
  if (requested > 0) {
    return Math.max(1, Math.round(requested));
  }
  return Math.max(3, Math.round(length * 0.05));
}

/** Gaussian-weighted moving average over a window of `window` samples (edges renormalised). */
export function smoothSeries(values: ArrayLike<number>, window: number): number[] {
  const n = values.length;
  const w = Math.max(1, Math.round(window));
  if (n < 3 || w <= 1) {
    return Array.from(values);
  }
  const half = Math.floor(w / 2);
  const sigma = Math.max(0.5, w / 3);
  const weights: number[] = [];
  for (let k = -half; k <= half; k++) {
    weights.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  }
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let norm = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        const wt = weights[k + half];
        acc += values[j] * wt;
        norm += wt;
      }
    }
    out[i] = norm > 0 ? acc / norm : values[i];
  }
  return out;
}

/** Position on the centreline at fraction s with lateral offset (px, +ve = left of travel). */
export function pointAt(c: Centreline, s: number, lateral = 0): Point {
  const k = Math.max(0, Math.min(c.M - 1, Math.round(s * (c.M - 1))));
  return { x: c.X[k] - c.TY[k] * lateral, y: c.Y[k] + c.TX[k] * lateral };
}

export function clampWaypoint(p: Waypoint): Waypoint {
  return { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
}
