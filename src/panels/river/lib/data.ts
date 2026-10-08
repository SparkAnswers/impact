import { type DataFrame, type Field, FieldType, getFieldDisplayName } from '@grafana/data';
import { type Channel, type RiverOptions, type ValueSource, createChannel } from '../types';
import { presetWaypoints } from './path';

export interface NumericField {
  field: Field;
  frame: DataFrame;
  frameIndex: number;
  displayName: string;
}

export interface BoundLane {
  name: string;
  values: number[];
  field?: Field;
}

export interface BoundChannel {
  channel: Channel;
  lanes: BoundLane[];
  /** Width multipliers along the path (normalised 0..1), or null for constant width. */
  widths: number[] | null;
  /** Latest (last) value of the first lane. */
  latest: number | undefined;
  /** Field used for display formatting (unit, decimals, thresholds). */
  field?: Field;
  /** Travel direction after resolving 'bySign'. */
  direction: 1 | -1;
  /** Min/max over all lane values. */
  range: [number, number];
}

/** All numeric (non-time) fields across frames in order. */
export function getNumericFields(frames: DataFrame[]): NumericField[] {
  const out: NumericField[] = [];
  frames.forEach((frame, frameIndex) => {
    for (const field of frame.fields) {
      if (field.type === FieldType.number) {
        out.push({ field, frame, frameIndex, displayName: getFieldDisplayName(field, frame, frames) });
      }
    }
  });
  return out;
}

export function fieldValues(field: Field): number[] {
  const out: number[] = [];
  const n = field.values.length;
  for (let i = 0; i < n; i++) {
    const v = field.values[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push(v);
    }
  }
  return out;
}

/** Matches a series selector (refId, frame name, or 0-based index) to a frame index. */
export function findFrameIndex(frames: DataFrame[], selector: string): number {
  const s = selector.trim();
  if (!s) {
    return -1;
  }
  let i = frames.findIndex((f) => f.refId === s);
  if (i >= 0) {
    return i;
  }
  i = frames.findIndex((f) => f.name === s);
  if (i >= 0) {
    return i;
  }
  if (/^\d+$/.test(s)) {
    const idx = Number(s);
    return idx < frames.length ? idx : -1;
  }
  return -1;
}

export function resolveSource(
  source: ValueSource | undefined,
  numeric: NumericField[],
  frames: DataFrame[],
  autoIndex: number
): NumericField | undefined {
  const mode = source?.mode ?? 'series';
  if (mode === 'fixed') {
    return undefined;
  }
  if (mode === 'field') {
    const name = (source?.field ?? '').trim();
    if (!name) {
      return numeric[autoIndex] ?? numeric[0];
    }
    return numeric.find((f) => f.displayName === name || f.field.name === name);
  }
  const sel = source?.series ?? '';
  if (!sel.trim()) {
    return numeric[autoIndex] ?? numeric[0];
  }
  const frameIndex = findFrameIndex(frames, sel);
  if (frameIndex < 0) {
    return undefined;
  }
  return numeric.find((f) => f.frameIndex === frameIndex);
}

/** Effective channels: configured ones, or a default S-curve bound to the first series. */
export function effectiveChannels(options: Partial<RiverOptions>): Channel[] {
  const list = (options.channels ?? []).map((c) => createChannel(c));
  if (list.length === 0) {
    return [
      createChannel({
        id: 'default',
        name: 'Flow',
        path: presetWaypoints('scurve'),
        colorScale: options.defaultColorScale ?? 'turbo',
        particles: { count: 2500, speed: 1, trail: 0.86, width: 1.1, color: 'white' },
      }),
    ];
  }
  return list.map((c) => (c.path.length >= 2 ? c : { ...c, path: presetWaypoints('horizontal') }));
}

export function bindChannels(channels: Channel[], frames: DataFrame[]): BoundChannel[] {
  const numeric = getNumericFields(frames);
  return channels.map((channel, index) => bindChannel(channel, index, channels.length, numeric, frames));
}

function bindChannel(
  channel: Channel,
  index: number,
  total: number,
  numeric: NumericField[],
  frames: DataFrame[]
): BoundChannel {
  const lanes: BoundLane[] = [];
  let field: Field | undefined;
  const speed = channel.speedSource ?? { mode: 'series' as const };

  if (speed.mode === 'fixed') {
    lanes.push({ name: channel.name, values: [Number.isFinite(speed.fixed) ? Number(speed.fixed) : 0] });
  } else {
    const explicit = Boolean(speed.mode === 'field' ? speed.field?.trim() : speed.series?.trim());
    const useLanes = total === 1 && channel.multiSeries === 'lanes' && !explicit;
    if (useLanes && numeric.length > 1) {
      for (const nf of numeric) {
        lanes.push({ name: nf.displayName, values: fieldValues(nf.field), field: nf.field });
      }
      field = numeric[0].field;
    } else {
      const nf = resolveSource(speed, numeric, frames, index);
      if (nf) {
        lanes.push({ name: nf.displayName, values: fieldValues(nf.field), field: nf.field });
        field = nf.field;
      }
    }
  }
  for (const lane of lanes) {
    if (lane.values.length === 0) {
      lane.values = [0];
    }
  }

  let widths: number[] | null = null;
  const ws = channel.widthSource;
  if (ws && ws.mode !== 'fixed') {
    const nf = resolveSource(ws, numeric, frames, index);
    if (nf) {
      const raw = fieldValues(nf.field).map((v) => Math.abs(v));
      const max = Math.max(...raw, 0);
      widths = max > 0 ? raw.map((v) => Math.max(0.05, v / max)) : null;
    }
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const lane of lanes) {
    for (const v of lane.values) {
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
      sum += v;
      n++;
    }
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  let direction: 1 | -1 = channel.direction === 'reverse' ? -1 : 1;
  if (channel.direction === 'bySign') {
    direction = n > 0 && sum / n < 0 ? -1 : 1;
  }
  const first = lanes[0];
  return {
    channel,
    lanes,
    widths,
    latest: first ? first.values[first.values.length - 1] : undefined,
    field,
    direction,
    range: [min, max],
  };
}
