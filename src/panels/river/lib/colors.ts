import type { Threshold } from '@grafana/data';
import type { ColorPreset, ColorStop } from '../types';

export type RGB = [number, number, number];

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

function turbo(t: number): RGB {
  t = clamp01(t);
  const r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))));
  const g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))));
  const b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814.0 - t * (22569.18 - t * 6838.66))));
  return [r, g, b].map((v) => Math.max(0, Math.min(255, v))) as RGB;
}

function stopsFn(list: RGB[]): (t: number) => RGB {
  return (t) => {
    t = clamp01(t);
    const n = list.length - 1;
    const i = Math.min(n - 1, Math.floor(t * n));
    const f = t * n - i;
    const a = list[i];
    const b = list[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}

const PRESET_FNS: Record<Exclude<ColorPreset, 'thresholds' | 'custom'>, (t: number) => RGB> = {
  turbo,
  viridis: stopsFn([
    [68, 1, 84],
    [72, 40, 120],
    [62, 74, 137],
    [49, 104, 142],
    [38, 130, 142],
    [31, 158, 137],
    [53, 183, 121],
    [109, 205, 89],
    [180, 222, 44],
    [253, 231, 37],
  ]),
  inferno: stopsFn([
    [0, 0, 4],
    [40, 11, 84],
    [101, 21, 110],
    [159, 42, 99],
    [212, 72, 66],
    [245, 125, 21],
    [250, 193, 39],
    [252, 255, 164],
  ]),
  cool: stopsFn([
    [6, 24, 70],
    [10, 60, 140],
    [20, 120, 200],
    [40, 200, 230],
    [160, 245, 255],
    [255, 255, 255],
  ]),
  warm: stopsFn([
    [30, 8, 20],
    [110, 20, 50],
    [200, 50, 30],
    [250, 130, 20],
    [255, 210, 80],
    [255, 250, 200],
  ]),
};

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(). Unknown strings fall back to grey. */
export function parseColor(input: string): RGB {
  const s = (input ?? '').trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    }
    if (hex.length >= 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (m) {
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return [128, 128, 128];
}

export function rgbCss(c: RGB, alpha?: number): string {
  const r = Math.round(c[0]);
  const g = Math.round(c[1]);
  const b = Math.round(c[2]);
  return alpha === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export interface LegendTick {
  t: number;
  value: number;
}

export interface ColorMapper {
  preset: ColorPreset;
  domain: [number, number];
  /** Value to normalised position 0..1 (piecewise for custom stops, stepped for thresholds). */
  toT: (v: number) => number;
  /** Normalised position to colour. */
  atT: (t: number) => RGB;
  rgb: (v: number) => RGB;
  css: (v: number) => string;
  /** CSS linear-gradient string for the legend. */
  gradient: string;
  ticks: LegendTick[];
  /** True when the scale is stepped (thresholds). */
  stepped: boolean;
}

export interface ColorMapperOptions {
  preset: ColorPreset;
  domain: [number, number];
  customStops?: ColorStop[];
  thresholds?: Threshold[];
  /** Resolves named colours (e.g. "green", "dark-red") to CSS; defaults to identity. */
  resolveColor?: (c: string) => string;
}

function evenTicks(domain: [number, number], n = 5): LegendTick[] {
  const [a, b] = domain;
  const out: LegendTick[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push({ t, value: a + (b - a) * t });
  }
  return out;
}

function gradientFromFn(fn: (t: number) => RGB, steps = 24): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    parts.push(rgbCss(fn(i / steps)));
  }
  return `linear-gradient(90deg,${parts.join(',')})`;
}

function steppedGradient(segments: Array<{ t0: number; t1: number; color: RGB }>): string {
  const parts: string[] = [];
  for (const s of segments) {
    const c = rgbCss(s.color);
    parts.push(`${c} ${(s.t0 * 100).toFixed(2)}%`, `${c} ${(s.t1 * 100).toFixed(2)}%`);
  }
  return `linear-gradient(90deg,${parts.join(',')})`;
}

function safeDomain(d: [number, number]): [number, number] {
  let [a, b] = d;
  if (!Number.isFinite(a)) {
    a = 0;
  }
  if (!Number.isFinite(b)) {
    b = a + 1;
  }
  if (b <= a) {
    b = a + (Math.abs(a) || 1);
  }
  return [a, b];
}

export function createColorMapper(opts: ColorMapperOptions): ColorMapper {
  const resolve = opts.resolveColor ?? ((c) => c);
  const preset = opts.preset;

  if (preset === 'thresholds') {
    const steps = (opts.thresholds ?? [])
      .map((s) => ({ value: s.value === null || s.value === undefined ? -Infinity : s.value, color: parseColor(resolve(s.color)) }))
      .sort((a, b) => a.value - b.value);
    if (steps.length === 0) {
      steps.push({ value: -Infinity, color: [128, 128, 128] });
    }
    const finite = steps.filter((s) => Number.isFinite(s.value)).map((s) => s.value);
    const domain = safeDomain(
      finite.length > 0 ? [Math.min(opts.domain[0], finite[0]), Math.max(opts.domain[1], finite[finite.length - 1])] : opts.domain
    );
    const stepFor = (v: number) => {
      let cur = steps[0];
      for (const s of steps) {
        if (v >= s.value) {
          cur = s;
        } else {
          break;
        }
      }
      return cur;
    };
    const toT = (v: number) => clamp01((v - domain[0]) / (domain[1] - domain[0]));
    const atT = (t: number) => stepFor(domain[0] + (domain[1] - domain[0]) * clamp01(t)).color;
    const rgb = (v: number) => stepFor(v).color;
    const segments = steps.map((s, i) => {
      const t0 = Number.isFinite(s.value) ? toT(s.value) : 0;
      const next = steps[i + 1];
      const t1 = next ? toT(next.value) : 1;
      return { t0, t1, color: s.color };
    });
    const ticks: LegendTick[] = [{ t: 0, value: domain[0] }];
    for (const s of steps) {
      if (Number.isFinite(s.value) && s.value > domain[0] && s.value < domain[1]) {
        ticks.push({ t: toT(s.value), value: s.value });
      }
    }
    ticks.push({ t: 1, value: domain[1] });
    return { preset, domain, toT, atT, rgb, css: (v) => rgbCss(rgb(v)), gradient: steppedGradient(segments), ticks, stepped: true };
  }

  if (preset === 'custom') {
    const stops = (opts.customStops ?? [])
      .filter((s) => Number.isFinite(s.value))
      .map((s) => ({ value: s.value, color: parseColor(resolve(s.color)) }))
      .sort((a, b) => a.value - b.value);
    if (stops.length < 2) {
      return createColorMapper({ ...opts, preset: 'turbo' });
    }
    const n = stops.length - 1;
    const domain: [number, number] = [stops[0].value, stops[n].value];
    const toT = (v: number) => {
      if (v <= stops[0].value) {
        return 0;
      }
      for (let i = 0; i < n; i++) {
        if (v <= stops[i + 1].value) {
          const span = stops[i + 1].value - stops[i].value;
          const f = span > 0 ? (v - stops[i].value) / span : 1;
          return (i + f) / n;
        }
      }
      return 1;
    };
    const atT = stopsFn(stops.map((s) => s.color));
    const rgb = (v: number) => atT(toT(v));
    return {
      preset,
      domain,
      toT,
      atT,
      rgb,
      css: (v) => rgbCss(rgb(v)),
      gradient: gradientFromFn(atT),
      ticks: stops.map((s, i) => ({ t: i / n, value: s.value })),
      stepped: false,
    };
  }

  const fn = PRESET_FNS[preset] ?? turbo;
  const domain = safeDomain(opts.domain);
  const toT = (v: number) => clamp01((v - domain[0]) / (domain[1] - domain[0]));
  const rgb = (v: number) => fn(toT(v));
  return {
    preset,
    domain,
    toT,
    atT: fn,
    rgb,
    css: (v) => rgbCss(rgb(v)),
    gradient: gradientFromFn(fn),
    ticks: evenTicks(domain),
    stepped: false,
  };
}

export const COLOR_PRESET_OPTIONS: Array<{ value: ColorPreset; label: string }> = [
  { value: 'turbo', label: 'Turbo' },
  { value: 'viridis', label: 'Viridis' },
  { value: 'inferno', label: 'Inferno' },
  { value: 'cool', label: 'Cool' },
  { value: 'warm', label: 'Warm' },
  { value: 'thresholds', label: 'Thresholds (field config)' },
  { value: 'custom', label: 'Custom stops' },
];
