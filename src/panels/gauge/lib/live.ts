/**
 * Pure maths for the "Live motion" behaviour: everything here derives motion from samples that were
 * already received (timestamps, values, arrival times). Nothing invents data.
 */
import { rangeUtil } from '@grafana/data';

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Infers the sample cadence (ms) from the last `n` timestamps as the median of the positive gaps.
 * Returns null when there are fewer than two usable timestamps.
 */
export function inferSampleInterval(times: ArrayLike<number | null | undefined>, n = 20): number | null {
  const gaps: number[] = [];
  let prev: number | null = null;
  const start = Math.max(0, times.length - n);
  for (let i = start; i < times.length; i++) {
    const t = times[i];
    if (typeof t !== 'number' || !Number.isFinite(t)) {
      continue;
    }
    if (prev !== null && t > prev) {
      gaps.push(t - prev);
    }
    prev = t;
  }
  return gaps.length ? median(gaps) : null;
}

/** Parses a dashboard refresh string such as "10s" or "1m" into ms; null when empty/invalid/off. */
export function parseRefreshInterval(text: string | null | undefined): number | null {
  if (!text || typeof text !== 'string') {
    return null;
  }
  try {
    const ms = rangeUtil.intervalToMs(text.trim());
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

/** Minimum stale threshold so dashboards without auto-refresh do not report "stale" after seconds. */
export const STALE_FLOOR_MS = 60_000;

/** Stale threshold = max(3 x sample interval, 2 x refresh interval, 60 s); null when neither interval is known. */
export function staleThreshold(sampleInterval: number | null, refreshInterval: number | null, floor = STALE_FLOOR_MS): number | null {
  const a = sampleInterval && sampleInterval > 0 ? 3 * sampleInterval : null;
  const b = refreshInterval && refreshInterval > 0 ? 2 * refreshInterval : null;
  if (a === null && b === null) {
    return null;
  }
  return Math.max(a ?? 0, b ?? 0, floor);
}

export const MIN_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 300_000;
export const DEFAULT_DELAY_MS = 15_000;

/**
 * Jitter-buffer delay for stream playback. The playhead runs this far behind the wall clock so a
 * refresh normally lands before the playhead reaches the newest sample.
 * - `observedRefresh`: gap between the last two data arrivals (null until two were seen).
 * - `fallbackRefresh`: the dashboard refresh interval when known.
 * - `latency`: observed arrival latency (arrival time minus newest sample time).
 */
export function adaptiveDelay(observedRefresh: number | null, fallbackRefresh: number | null, latency: number): number {
  const margin = Math.max(1000, 1.5 * Math.max(0, latency));
  const base = observedRefresh && observedRefresh > 0 ? observedRefresh : fallbackRefresh && fallbackRefresh > 0 ? fallbackRefresh : null;
  if (base === null) {
    return DEFAULT_DELAY_MS;
  }
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, base * 1.25 + margin));
}

/** Delay that would have avoided an underrun at `wall` (playhead reached `newest`), with a margin. */
export function underrunDelay(wall: number, newest: number, latency: number): number {
  return Math.min(MAX_DELAY_MS, wall - newest + Math.max(1000, 1.5 * Math.max(0, latency)));
}

/**
 * Advances the playhead by one frame. It moves at wall-clock speed towards `wall - delay` and is
 * hard-capped at `newest`: when the buffer runs dry it eases towards the newest sample and never
 * passes it, and it never moves backwards or jumps.
 */
export function advancePlayhead(prev: number | null, wall: number, delay: number, newest: number, dt: number, tau = 600): number {
  const desired = Math.min(wall - delay, newest);
  if (prev === null) {
    return desired;
  }
  const normal = prev + Math.max(0, dt);
  if (normal <= desired) {
    return normal;
  }
  if (desired <= prev) {
    return prev;
  }
  return easeTowards(prev, desired, dt, tau);
}

/**
 * Linear interpolation of a series at time `t`. Times must be ascending. Before the first sample
 * the first value is returned, after the last the last value; null when empty.
 */
export function interpolateAt(times: ArrayLike<number>, values: ArrayLike<number>, t: number): number | null {
  const n = Math.min(times.length, values.length);
  if (n === 0) {
    return null;
  }
  if (t <= times[0]) {
    return values[0];
  }
  if (t >= times[n - 1]) {
    return values[n - 1];
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const span = times[hi] - times[lo];
  if (span <= 0) {
    return values[hi];
  }
  const f = (t - times[lo]) / span;
  return values[lo] + (values[hi] - values[lo]) * f;
}

/** Age (ms) of the newest sample at wall-clock `now`, never negative. */
export function sampleAge(now: number, newestTime: number): number {
  return Math.max(0, now - newestTime);
}

export function isStale(now: number, newestTime: number | null, threshold: number | null): boolean {
  if (newestTime === null || threshold === null) {
    return false;
  }
  return sampleAge(now, newestTime) > threshold;
}

export interface LiveWindow {
  from: number;
  to: number;
}

/**
 * Wall-clock window for the history chart. The data window ends at `dataTo` (the end of the panel
 * time range, or the newest sample). As wall-clock time passes after the data arrived, the window
 * slides forward by the same amount, so existing samples move left at real speed.
 */
export function liveWindow(dataTo: number, span: number, receivedAt: number, now: number): LiveWindow {
  const to = dataTo + Math.max(0, now - receivedAt);
  return { from: to - span, to };
}

/** Horizontal position 0..1 of a timestamp in a window (not clamped). */
export function scrollX(t: number, win: LiveWindow): number {
  const span = win.to - win.from;
  return span > 0 ? (t - win.from) / span : 1;
}

/**
 * Whether sliding the window is meaningful: the data must end close to the moment it arrived
 * (relative "now" ranges). Absolute ranges far in the past must not scroll.
 */
export function canScroll(dataTo: number, receivedAt: number, refreshInterval: number | null): boolean {
  const tolerance = Math.max(60_000, 2 * (refreshInterval ?? 0));
  return Math.abs(receivedAt - dataTo) <= tolerance;
}

/** Exponential approach: moves `current` towards `target` for a frame of `dt` ms with time constant `tau`. */
export function easeTowards(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0 || dt <= 0) {
    return target;
  }
  const k = 1 - Math.exp(-dt / tau);
  const next = current + (target - current) * k;
  return Math.abs(target - next) < 1e-6 ? target : next;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Time based tween with ease-out-cubic. Returns the target once `elapsed >= duration`. */
export function tween(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) {
    return to;
  }
  if (elapsed <= 0) {
    return from;
  }
  return from + (to - from) * easeOutCubic(elapsed / duration);
}

/** Breathing multiplier in [1 - amplitude/2, 1 + amplitude/2], sinusoidal with the given period (ms). */
export function breathing(now: number, period: number, amplitude: number): number {
  if (amplitude <= 0 || period <= 0) {
    return 1;
  }
  return 1 + (amplitude / 2) * Math.sin((2 * Math.PI * now) / period);
}

/** Trail opacity for a sample of `age` ms inside a `window` ms long trail: 1 at age 0, 0 at the window end. */
export function trailAlpha(age: number, window: number): number {
  if (window <= 0 || age < 0) {
    return 0;
  }
  const t = 1 - age / window;
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t;
}

/** Fade-out window of the marker trail after the last data arrival (ms). */
export const TRAIL_FADE_MS = 8_000;

/** Wall-clock freshness of the trail: 1 right after data arrived, 0 once `fade` ms passed without new data. */
export function trailFreshness(wall: number, arrivedAt: number, fade = TRAIL_FADE_MS): number {
  return trailAlpha(wall - arrivedAt, fade);
}
