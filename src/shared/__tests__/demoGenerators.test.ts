import { FieldType } from '@grafana/data';
import {
  deviceTable,
  edgeTable,
  EDGE_TABLE_NODES,
  multiSeries,
  percentLoadSeries,
  seededRandom,
  signedPowerSeries,
} from '../demo';

const NOW = 1_760_000_000_000;
const HOUR = 3_600_000;
const STEP = 60_000;

describe('seededRandom', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom(43)()).not.toBe(seededRandom(42)());
  });
});

describe('time series generators', () => {
  it.each([
    ['signedPowerSeries', signedPowerSeries, 'power', -20, 20],
    ['percentLoadSeries', percentLoadSeries, 'load', 0, 100],
  ] as const)('%s has time + value fields, 61 rows, within range, deterministic', (_n, gen, name, min, max) => {
    const f = gen(NOW, HOUR, STEP);
    expect(f.fields.map((x) => [x.name, x.type])).toEqual([
      ['time', FieldType.time],
      [name, FieldType.number],
    ]);
    expect(f.length).toBe(61);
    const time = f.fields[0].values;
    expect(time[0]).toBe(NOW - HOUR);
    expect(time[time.length - 1]).toBe(NOW);
    const values = f.fields[1].values as number[];
    expect(values.every((v) => v >= min - 5 && v <= max + 5)).toBe(true);
    expect(values).toEqual(gen(NOW, HOUR, STEP).fields[1].values);
    expect(values).not.toEqual(gen(NOW, HOUR, STEP, { seed: 99 }).fields[1].values);
  });

  it('signedPowerSeries crosses zero', () => {
    const v = signedPowerSeries(NOW, HOUR, STEP).fields[1].values as number[];
    expect(v.some((x) => x > 0) && v.some((x) => x < 0)).toBe(true);
  });

  it('multiSeries returns n frames with shared timestamps and distinct walks', () => {
    const frames = multiSeries(3, NOW, HOUR, STEP, { names: ['a', 'b'] });
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.name)).toEqual(['a', 'b', 'series-3']);
    expect(frames[1].fields[0].values).toEqual(frames[0].fields[0].values);
    expect(frames[1].fields[1].values).not.toEqual(frames[0].fields[1].values);
    expect(multiSeries(0, NOW, HOUR, STEP)).toEqual([]);
  });
});

describe('deviceTable', () => {
  it('has the bars columns, n rows, nullable progress and is deterministic', () => {
    const t = deviceTable(14, { now: NOW });
    expect(t.fields.map((f) => f.name)).toEqual([
      'name',
      'progress',
      'status',
      'style',
      'version',
      'channel',
      'updated',
      'trend',
    ]);
    expect(t.length).toBe(14);
    expect(new Set(t.fields[0].values).size).toBe(14);
    const styles = t.fields[3].values as string[];
    const progress = t.fields[1].values as Array<number | null>;
    styles.forEach((s, i) => {
      if (s === 'sweep' || s === 'pill') {
        expect(progress[i]).toBeNull();
      } else {
        expect(typeof progress[i]).toBe('number');
      }
    });
    (t.fields[7].values as string[]).forEach((tr) => expect(tr.split(';')).toHaveLength(12));
    (t.fields[6].values as string[]).forEach((u) => expect(Date.parse(u)).toBeLessThanOrEqual(NOW));
    expect(t.fields.map((f) => f.values)).toEqual(deviceTable(14, { now: NOW }).fields.map((f) => f.values));
  });
});

describe('edgeTable', () => {
  it('is a source/target/value frame covering all 12 nodes with no self loops', () => {
    const e = edgeTable();
    expect(e.fields.map((f) => [f.name, f.type])).toEqual([
      ['source', FieldType.string],
      ['target', FieldType.string],
      ['value', FieldType.number],
    ]);
    const src = e.fields[0].values as string[];
    const dst = e.fields[1].values as string[];
    expect(EDGE_TABLE_NODES).toHaveLength(12);
    expect(new Set([...src, ...dst])).toEqual(new Set(EDGE_TABLE_NODES));
    src.forEach((s, i) => expect(s).not.toBe(dst[i]));
    expect((e.fields[2].values as number[]).every((v) => v > 0)).toBe(true);
    expect(e.fields[2].values).toEqual(edgeTable().fields[2].values);
  });
});
