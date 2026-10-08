// Deterministic synthetic data for the Impact panels. Pure functions, no DOM, no randomness beyond the
// seeded PRNG, so the same arguments always return the same frames (snapshot-friendly, demo-friendly).
import { createDataFrame, FieldType, type DataFrame } from '@grafana/data';

/** Small, fast seeded PRNG (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeriesOptions {
  /** PRNG seed; change it for a different but still deterministic series. */
  seed?: number;
  /** Field name for the value column (defaults differ per generator). */
  name?: string;
  /** Unit stored in the field config (e.g. `kwatt`, `percent`). */
  unit?: string;
}

function timestamps(now: number, durationMs: number, stepMs: number): number[] {
  const step = Math.max(1, stepMs);
  const count = Math.max(2, Math.floor(durationMs / step) + 1);
  const start = now - (count - 1) * step;
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    out[i] = start + i * step;
  }
  return out;
}

function round(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * Builds a time/value frame. Generated fields deliberately carry NO field config (unit, min, max,
 * decimals, display name): in `applyFieldOverrides` a field's own config wins over the panel's
 * `fieldConfig.defaults`, which would silently override what the user sets in Standard options.
 * The `unit`/`min`/`max` arguments only document the intended range of the generator.
 */
function series(name: string, time: number[], values: number[], _unit?: string, _min?: number, _max?: number): DataFrame {
  return createDataFrame({
    name,
    fields: [
      { name: 'time', type: FieldType.time, values: time },
      { name, type: FieldType.number, values, config: {} },
    ],
  });
}

/**
 * Signed "net power" series (kW) for the gauge: a slow daily-shaped swell plus a faster ripple and noise,
 * crossing zero (import vs export). Range roughly -20..+20.
 */
export function signedPowerSeries(
  now: number,
  durationMs: number,
  stepMs: number,
  opts: SeriesOptions = {}
): DataFrame {
  const rnd = seededRandom(opts.seed ?? 1);
  const time = timestamps(now, durationMs, stepMs);
  const n = time.length;
  let drift = 0;
  const values = time.map((_, i) => {
    const t = i / Math.max(1, n - 1);
    drift = drift * 0.9 + (rnd() - 0.5) * 1.2;
    const swell = Math.sin(t * Math.PI * 2 - Math.PI / 2) * 12;
    const ripple = Math.sin(t * Math.PI * 14) * 3.5;
    return round(swell + ripple + drift, 2);
  });
  return series(opts.name ?? 'power', time, values, opts.unit ?? 'kwatt', -20, 20);
}

/** Bounded random walk in 0..100 (percent load) with a gentle pull towards the middle. */
export function percentLoadSeries(
  now: number,
  durationMs: number,
  stepMs: number,
  opts: SeriesOptions = {}
): DataFrame {
  const rnd = seededRandom(opts.seed ?? 2);
  const time = timestamps(now, durationMs, stepMs);
  let v = 40 + rnd() * 20;
  const values = time.map(() => {
    v += (rnd() - 0.5) * 6 + (55 - v) * 0.02;
    v = Math.min(100, Math.max(0, v));
    return round(v, 1);
  });
  return series(opts.name ?? 'load', time, values, opts.unit ?? 'percent', 0, 100);
}

export interface MultiSeriesOptions extends SeriesOptions {
  /** Series names; defaults to generic `series-1..n`. Extra entries are ignored, missing ones are generated. */
  names?: string[];
  min?: number;
  max?: number;
}

/** `n` random-walk frames (time + value) sharing timestamps, each with its own seed. */
export function multiSeries(
  n: number,
  now: number,
  durationMs: number,
  stepMs: number,
  opts: MultiSeriesOptions = {}
): DataFrame[] {
  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  const time = timestamps(now, durationMs, stepMs);
  const frames: DataFrame[] = [];
  for (let s = 0; s < Math.max(0, n); s++) {
    const rnd = seededRandom((opts.seed ?? 3) * 1000 + s);
    const span = max - min;
    let v = min + span * (0.3 + rnd() * 0.4);
    const values = time.map(() => {
      v += (rnd() - 0.5) * span * 0.06;
      v = Math.min(max, Math.max(min, v));
      return round(v, 2);
    });
    frames.push(series(opts.names?.[s] ?? `series-${s + 1}`, time, values, opts.unit, min, max));
  }
  return frames;
}

const DEVICE_KINDS = [
  'Gateway',
  'Firewall',
  'Router',
  'Switch',
  'Access Point',
  'UPS',
  'Store',
  'Charger',
  'Hypervisor',
  'Controller',
];
const STATUSES = ['ok', 'ok', 'ok', 'warn', 'crit', 'updating'];
const STYLES = ['percent', 'percent', 'segmented', 'striped', 'sweep', 'sparkline', 'bidirectional', 'pill'];
const CHANNELS = ['Official', 'Early Access', 'Release Candidate'];

/**
 * One row per device for the status bars: name, progress, status, style, version, channel, updated (ISO)
 * and a `;`-separated sparkline trend. `updated` is derived from `now` so rows read as "a few minutes ago".
 */
export function deviceTable(n: number, opts: SeriesOptions & { now?: number } = {}): DataFrame {
  const rnd = seededRandom(opts.seed ?? 4);
  const now = opts.now ?? 0;
  const name: string[] = [];
  const progress: Array<number | null> = [];
  const status: string[] = [];
  const style: string[] = [];
  const version: string[] = [];
  const channel: string[] = [];
  const updated: string[] = [];
  const trend: string[] = [];
  for (let i = 0; i < Math.max(0, n); i++) {
    const kind = DEVICE_KINDS[i % DEVICE_KINDS.length];
    const ordinal = Math.floor(i / DEVICE_KINDS.length) + 1;
    name.push(ordinal > 1 ? `${kind} ${ordinal}` : kind);
    const st = STYLES[Math.floor(rnd() * STYLES.length)];
    style.push(st);
    status.push(STATUSES[Math.floor(rnd() * STATUSES.length)]);
    if (st === 'sweep' || st === 'pill') {
      progress.push(null);
    } else if (st === 'bidirectional') {
      progress.push(round((rnd() - 0.5) * 8, 1));
    } else {
      progress.push(round(rnd() * 100, 0));
    }
    version.push(`${1 + Math.floor(rnd() * 7)}.${Math.floor(rnd() * 10)}.${Math.floor(rnd() * 60)}`);
    channel.push(CHANNELS[Math.floor(rnd() * CHANNELS.length)]);
    updated.push(new Date(now - Math.floor(rnd() * 3600) * 1000).toISOString());
    const points: number[] = [];
    let v = 30 + rnd() * 40;
    for (let k = 0; k < 12; k++) {
      v = Math.min(100, Math.max(0, v + (rnd() - 0.5) * 20));
      points.push(Math.round(v));
    }
    trend.push(points.join(';'));
  }
  return createDataFrame({
    name: 'devices',
    fields: [
      { name: 'name', type: FieldType.string, values: name },
      {
        name: 'progress',
        type: FieldType.number,
        values: progress,
        config: {},
      },
      { name: 'status', type: FieldType.string, values: status },
      { name: 'style', type: FieldType.string, values: style },
      { name: 'version', type: FieldType.string, values: version },
      { name: 'channel', type: FieldType.string, values: channel },
      { name: 'updated', type: FieldType.string, values: updated },
      { name: 'trend', type: FieldType.string, values: trend },
    ],
  });
}

/** The 12 nodes of the demo service graph, in topological order (edges only go left to right). */
export const EDGE_TABLE_NODES = [
  'edge-proxy',
  'api-gateway',
  'auth',
  'catalog',
  'search',
  'cart',
  'checkout',
  'payments',
  'inventory',
  'notifications',
  'cache',
  'database',
] as const;

const EDGES: Array<[string, string]> = [
  ['edge-proxy', 'api-gateway'],
  ['api-gateway', 'auth'],
  ['api-gateway', 'catalog'],
  ['api-gateway', 'search'],
  ['api-gateway', 'cart'],
  ['api-gateway', 'checkout'],
  ['catalog', 'cache'],
  ['catalog', 'database'],
  ['search', 'cache'],
  ['cart', 'cache'],
  ['cart', 'inventory'],
  ['checkout', 'payments'],
  ['checkout', 'inventory'],
  ['checkout', 'notifications'],
  ['inventory', 'database'],
  ['payments', 'database'],
  ['auth', 'cache'],
];

/**
 * Edge frame for a 12-node service graph: `source`, `target`, `value` (requests/s). Node names are generic
 * roles, no environment-specific hosts. 17 edges, every node appears at least once.
 */
export function edgeTable(opts: SeriesOptions = {}): DataFrame {
  const rnd = seededRandom(opts.seed ?? 5);
  const source = EDGES.map((e) => e[0]);
  const target = EDGES.map((e) => e[1]);
  const value = EDGES.map(() => round(20 + rnd() * 480, 1));
  return createDataFrame({
    name: 'edges',
    fields: [
      { name: 'source', type: FieldType.string, values: source },
      { name: 'target', type: FieldType.string, values: target },
      { name: 'value', type: FieldType.number, values: value, config: {} },
    ],
  });
}

// ---- Time-anchored ("rolling") generators ---------------------------------------------------------
// The generators above shape their series over the requested window, so moving `now` reshapes them.
// The ones below are pure functions of the absolute timestamp: regenerating for a later `now` yields
// the same values at the same instants, so a panel can regenerate on every refresh and its history
// simply slides (stream / live-motion modes keep working with no jumps).

/** One deterministic unit value for an integer lattice point. */
function latticeUnit(i: number, seed: number): number {
  return seededRandom(Math.imul(i, 7919) + Math.imul(seed, 104729))();
}

/**
 * Smooth seeded value noise over absolute time, in -1..1. Continuous in `t`; `periodMs` sets how
 * quickly it wanders (one lattice point per period). Same `t`, `periodMs` and `seed` give the same value.
 */
export function smoothNoise(t: number, periodMs: number, seed = 1): number {
  const x = t / Math.max(1, periodMs);
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = latticeUnit(i, seed);
  const b = latticeUnit(i + 1, seed);
  return (a + (b - a) * s) * 2 - 1;
}

/** Timestamps on the `stepMs` grid ending at (or just before) `now`. */
function gridTimestamps(now: number, durationMs: number, stepMs: number): number[] {
  const step = Math.max(1, stepMs);
  return timestamps(Math.floor(now / step) * step, durationMs, step);
}

/**
 * Signed net power (kW) at an absolute time: a 15 minute swell, a faster ripple and smooth noise,
 * crossing zero (import vs export). Range -20..20.
 */
export function signedPowerAt(t: number, seed = 1): number {
  const swell = Math.sin((t / 900_000) * Math.PI * 2) * 12;
  const ripple = Math.sin((t / 128_000) * Math.PI * 2) * 3.5;
  const noise = smoothNoise(t, 20_000, seed) * 2.5 + smoothNoise(t, 4_000, seed + 7) * 0.8;
  return round(Math.max(-20, Math.min(20, swell + ripple + noise)), 2);
}

/** Same shape as `signedPowerSeries` but anchored to absolute time: timestamps snap to the step grid. */
export function rollingSignedPowerSeries(
  now: number,
  durationMs: number,
  stepMs: number,
  opts: SeriesOptions = {}
): DataFrame {
  const seed = opts.seed ?? 1;
  const time = gridTimestamps(now, durationMs, stepMs);
  const values = time.map((t) => signedPowerAt(t, seed));
  return series(opts.name ?? 'power', time, values, opts.unit ?? 'kwatt', -20, 20);
}

/**
 * Same shape as `multiSeries` but anchored to absolute time: `n` smooth frames in `min..max` sharing
 * grid-snapped timestamps, each with its own slow cycle and noise.
 */
export function rollingMultiSeries(
  n: number,
  now: number,
  durationMs: number,
  stepMs: number,
  opts: MultiSeriesOptions = {}
): DataFrame[] {
  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  const span = max - min;
  const time = gridTimestamps(now, durationMs, stepMs);
  const frames: DataFrame[] = [];
  for (let s = 0; s < Math.max(0, n); s++) {
    const seed = (opts.seed ?? 3) * 1000 + s;
    const period = 600_000 + s * 260_000;
    const phase = (s * Math.PI * 2) / 3;
    const values = time.map((t) => {
      const cycle = Math.sin((t / period) * Math.PI * 2 + phase) * 0.28;
      const slow = smoothNoise(t, 90_000, seed) * 0.14;
      const fast = smoothNoise(t, 12_000, seed + 11) * 0.05;
      const v = min + span * (0.5 + cycle + slow + fast);
      return round(Math.min(max, Math.max(min, v)), 2);
    });
    frames.push(series(opts.names?.[s] ?? `series-${s + 1}`, time, values, opts.unit, min, max));
  }
  return frames;
}

/** Every bar style the status bars support, in display order. */
const ALL_BAR_STYLES = ['percent', 'segmented', 'striped', 'sweep', 'bidirectional', 'stacked', 'sparkline', 'pill'];

/**
 * Like `deviceTable` but the `style` column cycles through every bar style in order, so a demo table
 * of 8+ rows shows each style at least once. Other columns are generated as in `deviceTable`.
 */
export function deviceTableWithStyles(n: number, opts: SeriesOptions & { now?: number } = {}): DataFrame {
  const frame = deviceTable(n, opts);
  const rnd = seededRandom((opts.seed ?? 4) + 17);
  const style = frame.fields.find((f) => f.name === 'style');
  const progress = frame.fields.find((f) => f.name === 'progress');
  if (!style || !progress) {
    return frame;
  }
  const styles: string[] = [];
  const values: Array<number | null> = [];
  for (let i = 0; i < frame.length; i++) {
    const st = ALL_BAR_STYLES[i % ALL_BAR_STYLES.length];
    styles.push(st);
    if (st === 'sweep' || st === 'pill') {
      values.push(null);
    } else if (st === 'bidirectional') {
      values.push(round((rnd() - 0.5) * 8, 1));
    } else {
      values.push(round(rnd() * 100, 0));
    }
  }
  style.values = styles;
  progress.values = values;
  return frame;
}
