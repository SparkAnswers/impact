import { type DataFrame, type Field, FieldType, getFieldDisplayName, type TimeRange } from '@grafana/data';

export type HistorySource = 'timeRange' | 'lastN';

export interface HistoryPoint {
  /** Horizontal position 0..1 (0 = oldest edge, 1 = newest edge). */
  x: number;
  value: number;
  /** Epoch ms of the sample when the frame has a time field. */
  t?: number;
}

export interface GaugeSeries {
  field: Field;
  frame: DataFrame;
  /** Last non-null numeric value, or null when the window is empty. */
  latest: number | null;
  /** Points inside the visible window, ordered oldest to newest. */
  history: HistoryPoint[];
  /** Raw values of the visible window (nulls dropped), used by the reducers. */
  windowValues: number[];
  /** Data min/max of the visible window (for auto range). */
  dataMin: number | null;
  dataMax: number | null;
  /** Timestamps (epoch ms) of the visible window, same order as `windowValues`; null without a time field. */
  windowTimes: Array<number | null>;
  /** Epoch ms of the newest sample in the window, null without a time field. */
  newestTime: number | null;
  /** End of the data window: the panel range end when known, else the newest sample. */
  dataTo: number | null;
  /** Length (ms) of the data window when known. */
  span: number | null;
}

/** Picks the numeric field: by display name when requested, else the first numeric field of the first frame with one. */
export function pickField(frames: DataFrame[], fieldName?: string): { frame: DataFrame; field: Field } | null {
  if (fieldName) {
    for (const frame of frames) {
      for (const field of frame.fields) {
        if (field.type === FieldType.number && (getFieldDisplayName(field, frame, frames) === fieldName || field.name === fieldName)) {
          return { frame, field };
        }
      }
    }
  }
  for (const frame of frames) {
    const field = frame.fields.find((f) => f.type === FieldType.number);
    if (field) {
      return { frame, field };
    }
  }
  return null;
}

export interface ExtractOptions {
  fieldName?: string;
  source: HistorySource;
  /** Number of samples when `source` is `lastN`. */
  points: number;
  timeRange?: TimeRange;
}

const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Shapes the panel data into the current value plus the history window. */
export function extractSeries(frames: DataFrame[], opts: ExtractOptions): GaugeSeries | null {
  const picked = pickField(frames, opts.fieldName);
  if (!picked) {
    return null;
  }
  const { frame, field } = picked;
  const timeField = frame.fields.find((f) => f.type === FieldType.time);
  const n = field.values.length;
  const points: Array<{ t: number | null; value: number; i: number }> = [];
  for (let i = 0; i < n; i++) {
    const v = asNumber(field.values[i]);
    if (v === null) {
      continue;
    }
    const t = timeField ? asNumber(timeField.values[i]) : null;
    points.push({ t, value: v, i });
  }

  let window = points;
  let from: number | null = null;
  let to: number | null = null;
  if (opts.source === 'lastN') {
    const count = Math.max(2, Math.floor(opts.points) || 2);
    window = points.slice(-count);
  } else if (opts.timeRange && timeField) {
    from = opts.timeRange.from.valueOf();
    to = opts.timeRange.to.valueOf();
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
      window = points.filter((p) => p.t !== null && p.t >= from! && p.t <= to!);
      if (window.length === 0) {
        // No samples inside the range: fall back to everything we have so the gauge is not empty.
        window = points;
        from = to = null;
      }
    } else {
      from = to = null;
    }
  }

  const windowValues = window.map((p) => p.value);
  const windowTimes = window.map((p) => p.t);
  const withT = (p: { t: number | null }) => (p.t === null ? {} : { t: p.t });
  let history: HistoryPoint[];
  let span: number | null = null;
  let dataTo: number | null = null;
  if (from !== null && to !== null) {
    span = to - from;
    dataTo = to;
    history = window.map((p) => ({ x: (p.t! - from!) / span!, value: p.value, ...withT(p) }));
  } else if (opts.source === 'timeRange' && timeField && window.length > 1 && window.every((p) => p.t !== null)) {
    const t0 = window[0].t!;
    const t1 = window[window.length - 1].t!;
    span = t1 - t0 || 1;
    dataTo = t1;
    history = window.map((p) => ({ x: (p.t! - t0) / span!, value: p.value, ...withT(p) }));
  } else {
    const count = opts.source === 'lastN' ? Math.max(2, Math.floor(opts.points) || 2) : Math.max(2, window.length);
    const offset = count - window.length;
    history = window.map((p, idx) => ({ x: (idx + offset) / (count - 1), value: p.value, ...withT(p) }));
  }
  let newestTime: number | null = null;
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i].t !== null) {
      newestTime = window[i].t;
      break;
    }
  }

  let dataMin: number | null = null;
  let dataMax: number | null = null;
  for (const v of windowValues) {
    dataMin = dataMin === null ? v : Math.min(dataMin, v);
    dataMax = dataMax === null ? v : Math.max(dataMax, v);
  }

  return {
    field,
    frame,
    latest: windowValues.length ? windowValues[windowValues.length - 1] : null,
    history,
    windowValues,
    dataMin,
    dataMax,
    windowTimes,
    newestTime,
    dataTo: dataTo ?? newestTime,
    span,
  };
}
