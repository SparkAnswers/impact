/**
 * Parses a cell value into a numeric series for a sparkline. Accepts arrays, JSON arrays, "1;2;3" / "1,2,3" / "1 2 3"
 * strings, and nested data frames (the "Trend" cells produced by the Time series to table transformation): the first
 * non-time field of the nested frame is used.
 */
export function parseSparkline(value: unknown): number[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const nums = value.map((v) => (typeof v === 'number' ? v : Number(v))).filter((v) => Number.isFinite(v));
    return nums.length > 1 ? nums : undefined;
  }
  if (typeof value === 'object' && value !== null && 'fields' in value) {
    const fields = (value as { fields?: unknown }).fields;
    if (Array.isArray(fields)) {
      const f = fields.find((x) => x && typeof x === 'object' && (x as { type?: string }).type !== 'time') as { values?: unknown } | undefined;
      return f ? parseSparkline(f.values) : undefined;
    }
    return undefined;
  }
  if (typeof value === 'object' && value !== null && 'values' in value) {
    // Vector-like (field) or nested-frame-like value
    const vals = (value as { values?: unknown }).values;
    return Array.isArray(vals) ? parseSparkline(vals) : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    if (trimmed.startsWith('[')) {
      try {
        return parseSparkline(JSON.parse(trimmed));
      } catch {
        return undefined;
      }
    }
    return parseSparkline(trimmed.split(/[;,\s|]+/));
  }
  return undefined;
}

export interface SparklineGeometry {
  line: string;
  area: string;
  last: { x: number; y: number };
}

/** Builds polyline/polygon point lists for an SVG sparkline in a w×h box. */
export function sparklineGeometry(values: number[], w: number, h: number, pad = 1): SparklineGeometry | undefined {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) {
    return undefined;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of pts) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const coords = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [round(x), round(y)] as const;
  });
  const line = coords.map((c) => `${c[0]},${c[1]}`).join(' ');
  const first = coords[0];
  const lastC = coords[coords.length - 1];
  const area = `${line} ${lastC[0]},${h - pad} ${first[0]},${h - pad}`;
  return { line, area, last: { x: lastC[0], y: lastC[1] } };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
