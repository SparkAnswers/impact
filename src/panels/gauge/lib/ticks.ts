import { normalizeScale, type ScaleSpec } from './scale';

/** Rounds a raw step to a 1/2/2.5/5 x 10^n value. */
export function niceStep(rawStep: number): number {
  if (!(rawStep > 0) || !Number.isFinite(rawStep)) {
    return 1;
  }
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const frac = rawStep / base;
  let nice: number;
  if (frac <= 1) {
    nice = 1;
  } else if (frac <= 2) {
    nice = 2;
  } else if (frac <= 2.5) {
    nice = 2.5;
  } else if (frac <= 5) {
    nice = 5;
  } else {
    nice = 10;
  }
  return nice * base;
}

function roundTo(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  return Number(v.toFixed(Math.min(decimals, 12)));
}

/**
 * Generates tick values. Ticks are laid out on each side of the zero mark so that the zero
 * mark is always a tick and the min/max ends are always ticks. `count` is a soft target for
 * the number of ticks on the larger side.
 */
export function generateTicks(spec: ScaleSpec, count = 4): number[] {
  const s = normalizeScale(spec);
  const out = new Set<number>();
  const sides: Array<[number, number]> = [
    [s.zero, s.max],
    [s.min, s.zero],
  ];
  const largest = Math.max(s.max - s.zero, s.zero - s.min);
  const step = niceStep(largest / Math.max(1, count));
  for (const [lo, hi] of sides) {
    if (hi - lo <= 0) {
      continue;
    }
    const first = Math.ceil(lo / step - 1e-9) * step;
    for (let v = first; v <= hi + 1e-9; v += step) {
      out.add(roundTo(v, step));
    }
  }
  out.add(s.min);
  out.add(s.max);
  out.add(s.zero);
  const ticks = [...out].filter((v) => v >= s.min && v <= s.max).sort((a, b) => a - b);
  // Drop ticks that crowd the ends (closer than 25% of a step to min/max).
  return ticks.filter((v, i) => {
    if (i === 0 || i === ticks.length - 1 || v === s.zero) {
      return true;
    }
    return v - s.min > step * 0.25 && s.max - v > step * 0.25;
  });
}

/** Parses a free-text list such as "-50, 0, 50, 100" into numbers (invalid items ignored). */
export function parseTickList(text: string | undefined): number[] {
  if (!text) {
    return [];
  }
  return text
    .split(/[,\s;]+/)
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n));
}

/** Smallest number of decimals that represents every value exactly (capped at `max`). */
export function decimalsNeeded(values: number[], max = 6): number {
  let needed = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) {
      continue;
    }
    for (let d = 0; d <= max; d++) {
      if (Math.abs(Number(v.toFixed(d)) - v) < 1e-9) {
        needed = Math.max(needed, d);
        break;
      }
      if (d === max) {
        needed = max;
      }
    }
  }
  return needed;
}

/**
 * Range used when the field has no min/max: the data range of the visible window, always including the
 * zero mark, padded a little and rounded outwards to a nice step so the ends land on round numbers.
 */
export function autoRange(dataMin: number | null, dataMax: number | null, zero: number): { min: number; max: number } {
  if (dataMin === null || dataMax === null) {
    return { min: zero, max: zero + 1 };
  }
  let lo = Math.min(zero, dataMin);
  let hi = Math.max(zero, dataMax);
  if (hi - lo <= 0) {
    hi = lo + 1;
  }
  const pad = (hi - lo) * 0.05;
  lo = lo === zero ? zero : lo - pad;
  hi = hi === zero ? zero : hi + pad;
  const step = niceStep((hi - lo) / 8);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  return { min: roundTo(min, step), max: roundTo(max, step) };
}
