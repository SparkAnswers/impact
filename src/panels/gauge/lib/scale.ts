/**
 * Pure maths for mapping values onto the ring.
 *
 * A "fraction" is a number 0..1 along the sweep, 0 = min end, 1 = max end.
 * A screen angle is in radians, 0 = 3 o'clock, increasing clockwise (canvas convention).
 */

export type ScaleKind = 'linear' | 'sqrt' | 'log';

export interface ScaleSpec {
  min: number;
  max: number;
  /** Value the fill originates from (the "zero mark"). Clamped to min..max. */
  zero: number;
  /** Fraction (0..1 from min end) where the zero mark sits. `undefined` = proportional to the ranges. */
  zeroPosition?: number;
  kind: ScaleKind;
}

export interface ArcSpec {
  /** Degrees, screen clockwise, 0 = 3 o'clock. */
  startAngle: number;
  /** Degrees, 0..360. */
  sweepAngle: number;
  /** When true values increase clockwise from the start angle. */
  clockwise: boolean;
}

/** Compression factor for the "log" scale: t' = ln(1 + k t) / ln(1 + k). */
const LOG_K = 9;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Applies the non-linear compression to a normalised distance 0..1. */
export function compress(t: number, kind: ScaleKind): number {
  const x = clamp(t, 0, 1);
  switch (kind) {
    case 'sqrt':
      return Math.sqrt(x);
    case 'log':
      return Math.log(1 + LOG_K * x) / Math.log(1 + LOG_K);
    default:
      return x;
  }
}

/** Inverse of {@link compress}. */
export function expand(f: number, kind: ScaleKind): number {
  const x = clamp(f, 0, 1);
  switch (kind) {
    case 'sqrt':
      return x * x;
    case 'log':
      return (Math.pow(1 + LOG_K, x) - 1) / LOG_K;
    default:
      return x;
  }
}

/** Normalises a user supplied spec so min < max and zero lies inside. */
export function normalizeScale(spec: ScaleSpec): ScaleSpec {
  let { min, max } = spec;
  if (!Number.isFinite(min)) {
    min = 0;
  }
  if (!Number.isFinite(max)) {
    max = min + 1;
  }
  if (max <= min) {
    max = min + 1;
  }
  const zero = clamp(Number.isFinite(spec.zero) ? spec.zero : 0, min, max);
  let zeroPosition = spec.zeroPosition;
  if (zeroPosition === undefined || !Number.isFinite(zeroPosition)) {
    zeroPosition = (zero - min) / (max - min);
  }
  zeroPosition = clamp(zeroPosition, 0, 1);
  return { min, max, zero, zeroPosition, kind: spec.kind };
}

/** Maps a value to its fraction along the sweep (0 = min end, 1 = max end). */
export function valueToFraction(value: number, spec: ScaleSpec): number {
  const s = normalizeScale(spec);
  const v = clamp(value, s.min, s.max);
  const zp = s.zeroPosition!;
  if (v >= s.zero) {
    const span = s.max - s.zero;
    if (span <= 0) {
      return zp;
    }
    return zp + compress((v - s.zero) / span, s.kind) * (1 - zp);
  }
  const span = s.zero - s.min;
  if (span <= 0) {
    return zp;
  }
  return zp - compress((s.zero - v) / span, s.kind) * zp;
}

/** Inverse of {@link valueToFraction}. */
export function fractionToValue(fraction: number, spec: ScaleSpec): number {
  const s = normalizeScale(spec);
  const f = clamp(fraction, 0, 1);
  const zp = s.zeroPosition!;
  if (f >= zp) {
    const t = 1 - zp <= 0 ? 0 : (f - zp) / (1 - zp);
    return s.zero + expand(t, s.kind) * (s.max - s.zero);
  }
  const t = zp <= 0 ? 0 : (zp - f) / zp;
  return s.zero - expand(t, s.kind) * (s.zero - s.min);
}

export const degToRad = (d: number) => (d * Math.PI) / 180;

/** Maps a sweep fraction to a screen angle in radians. */
export function fractionToAngle(fraction: number, arc: ArcSpec): number {
  const sweep = clamp(arc.sweepAngle, 0, 360);
  const f = clamp(fraction, 0, 1);
  return arc.clockwise ? degToRad(arc.startAngle + f * sweep) : degToRad(arc.startAngle + (1 - f) * sweep);
}

/** Convenience: value straight to screen angle. */
export function valueToAngle(value: number, spec: ScaleSpec, arc: ArcSpec): number {
  return fractionToAngle(valueToFraction(value, spec), arc);
}

export interface SignedArc {
  /** Angle (radians) at the zero mark. */
  from: number;
  /** Angle (radians) at the value. */
  to: number;
  /** Sweep fraction at the zero mark and the value. */
  fromFraction: number;
  toFraction: number;
  /** True when the value is at or above the zero mark. */
  positive: boolean;
  /** Angular size of the fill in radians (always >= 0). */
  size: number;
}

/**
 * The fill arc goes from the zero mark to the value. Positive values travel in the
 * "positive" direction (towards max), negative ones travel towards min.
 */
export function signedArc(value: number, spec: ScaleSpec, arc: ArcSpec): SignedArc {
  const s = normalizeScale(spec);
  const fromFraction = valueToFraction(s.zero, s);
  const toFraction = valueToFraction(value, s);
  const from = fractionToAngle(fromFraction, arc);
  const to = fractionToAngle(toFraction, arc);
  return {
    from,
    to,
    fromFraction,
    toFraction,
    positive: value >= s.zero,
    size: Math.abs(to - from),
  };
}

export const polar = (cx: number, cy: number, angle: number, r: number): [number, number] => [
  cx + Math.cos(angle) * r,
  cy + Math.sin(angle) * r,
];
