import { createTheme, FieldType, toDataFrame } from '@grafana/data';
import { mixColors, resolveBarColor, thresholdColor } from '../lib/color';
import type { BarRow } from '../lib/rows';
import { sortRows } from '../lib/sort';
import { parseSparkline, sparklineGeometry } from '../lib/sparkline';
import { parseBarStyle, resolveBarStyle } from '../lib/styleResolver';

const theme = createTheme();

describe('style resolution', () => {
  it('parses friendly names and aliases', () => {
    expect(parseBarStyle('Percent')).toBe('percent');
    expect(parseBarStyle(' bi-directional ')).toBe('bidirectional');
    expect(parseBarStyle('indeterminate')).toBe('sweep');
    expect(parseBarStyle('badge')).toBe('pill');
    expect(parseBarStyle('default')).toBeUndefined();
    expect(parseBarStyle('')).toBeUndefined();
    expect(parseBarStyle(null)).toBeUndefined();
    expect(parseBarStyle('unknown')).toBeUndefined();
  });
  it('prioritises style cell > override > default', () => {
    expect(resolveBarStyle('percent', undefined, undefined)).toBe('percent');
    expect(resolveBarStyle('percent', 'striped', undefined)).toBe('striped');
    expect(resolveBarStyle('percent', 'striped', 'pill')).toBe('pill');
    expect(resolveBarStyle('percent', 'default', 'garbage')).toBe('percent');
  });
});

describe('threshold colour lookup', () => {
  const field = toDataFrame({
    fields: [
      {
        name: 'v',
        type: FieldType.number,
        values: [1],
        config: {
          thresholds: {
            mode: 'absolute',
            steps: [
              { value: -Infinity, color: 'green' },
              { value: 70, color: 'orange' },
              { value: 90, color: 'red' },
            ],
          },
        },
      },
    ],
  }).fields[0];
  const pctField = toDataFrame({
    fields: [
      {
        name: 'v',
        type: FieldType.number,
        values: [1],
        config: {
          thresholds: {
            mode: 'percentage',
            steps: [
              { value: -Infinity, color: 'green' },
              { value: 50, color: 'red' },
            ],
          },
        },
      },
    ],
  }).fields[0];
  const c = (n: string) => theme.visualization.getColorByName(n);

  it('picks the active step for absolute thresholds', () => {
    expect(thresholdColor(theme, field, 10, 0.1)).toBe(c('green'));
    expect(thresholdColor(theme, field, 70, 0.7)).toBe(c('orange'));
    expect(thresholdColor(theme, field, 95, 0.95)).toBe(c('red'));
  });
  it('uses percent for percentage-mode thresholds', () => {
    expect(thresholdColor(theme, pctField, 1000, 0.2)).toBe(c('green'));
    expect(thresholdColor(theme, pctField, 1, 0.6)).toBe(c('red'));
  });
  it('returns undefined without thresholds or value', () => {
    expect(thresholdColor(theme, undefined, 1, 0)).toBeUndefined();
    expect(thresholdColor(theme, field, NaN, 0)).toBeUndefined();
  });
  it('resolveBarColor follows the colour mode', () => {
    const base = {
      theme,
      field,
      value: 95,
      percent: 0.95,
      fixedColor: 'blue',
      gradientFrom: '#000000',
      gradientTo: '#ffffff',
    };
    expect(resolveBarColor({ ...base, mode: 'fixed' })).toBe(c('blue'));
    expect(resolveBarColor({ ...base, mode: 'thresholds' })).toBe(c('red'));
    expect(resolveBarColor({ ...base, mode: 'field', fieldColor: '#123456' })).toBe('#123456');
    expect(resolveBarColor({ ...base, mode: 'gradient', percent: 0.5 })).toBe('rgb(128, 128, 128)');
  });
  it('mixColors interpolates hex colours', () => {
    expect(mixColors('#000000', '#ffffff', 0)).toBe('rgb(0, 0, 0)');
    expect(mixColors('#000000', '#ffffff', 1)).toBe('rgb(255, 255, 255)');
  });
});

describe('sparkline parsing', () => {
  it('accepts arrays, JSON and delimited strings', () => {
    expect(parseSparkline([1, 2, '3'])).toEqual([1, 2, 3]);
    expect(parseSparkline('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseSparkline('1;2;3')).toEqual([1, 2, 3]);
    expect(parseSparkline('1 2 3')).toEqual([1, 2, 3]);
    // Nested frame cell from the Time series to table transformation: first non-time field wins.
    const nested = toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'cpu', type: FieldType.number, values: [4, 5, 6] },
      ],
    });
    expect(parseSparkline(nested)).toEqual([4, 5, 6]);
    expect(parseSparkline({ fields: [] })).toBeUndefined();
    expect(parseSparkline('x')).toBeUndefined();
    expect(parseSparkline(5)).toBeUndefined();
  });
  it('builds geometry scaled to the box', () => {
    const g = sparklineGeometry([0, 10], 70, 20, 0)!;
    expect(g.line).toBe('0,20 70,0');
    expect(g.last).toEqual({ x: 70, y: 0 });
    expect(sparklineGeometry([1], 70, 20)).toBeUndefined();
  });
});

describe('sortRows', () => {
  const row = (name: string, value: number | undefined, extra?: string): BarRow => ({
    id: name,
    name,
    value,
    valueText: '',
    percent: 0,
    min: 0,
    max: 1,
    color: '',
    style: 'percent',
    extras: extra ? [{ text: extra }] : [],
    links: { extras: [] },
  });
  const rows = [row('b', 2, 'x'), row('a', undefined, 'z'), row('c', 1, 'y'), row('a10', 3), row('a2', 3)];

  it('sorts by name naturally and by value with missing last', () => {
    expect(sortRows(rows, { key: 'name', desc: false }).map((r) => r.name)).toEqual(['a', 'a2', 'a10', 'b', 'c']);
    expect(sortRows(rows, { key: 'value', desc: false }).map((r) => r.name)).toEqual(['c', 'b', 'a10', 'a2', 'a']);
    expect(sortRows(rows, { key: 'value', desc: true }).map((r) => r.name)).toEqual(['a10', 'a2', 'b', 'c', 'a']);
  });
  it('sorts by extra columns and leaves input untouched', () => {
    const sorted = sortRows(rows, { key: 'extra:0', desc: false });
    expect(sorted.slice(0, 3).map((r) => r.name)).toEqual(['b', 'c', 'a']);
    expect(rows[0].name).toBe('b');
    expect(sortRows(rows, undefined)).toBe(rows);
  });
});
