import { createTheme, FieldType, MappingType, ReducerID, toDataFrame } from '@grafana/data';
import { buildModel, isTimeSeriesFrame, normaliseRange } from '../lib/rows';
import { DEFAULT_OPTIONS, type BarsOptions } from '../types';

const theme = createTheme();
const opts = (o: Partial<BarsOptions> = {}): BarsOptions => ({ ...DEFAULT_OPTIONS, ...o });

describe('isTimeSeriesFrame', () => {
  it('detects time + number frames', () => {
    const f = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'v', type: FieldType.number, values: [1, 2] },
      ],
    });
    expect(isTimeSeriesFrame(f)).toBe(true);
  });
  it('treats frames with string fields as tables', () => {
    const f = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'name', type: FieldType.string, values: ['a', 'b'] },
        { name: 'v', type: FieldType.number, values: [1, 2] },
      ],
    });
    expect(isTimeSeriesFrame(f)).toBe(false);
  });
});

describe('normaliseRange', () => {
  it('floors positive data at zero and respects configured bounds', () => {
    expect(normaliseRange(10, 50, { min: NaN, max: NaN })).toEqual({ min: 0, max: 50 });
    expect(normaliseRange(10, 50, { min: 5, max: 20 })).toEqual({ min: 5, max: 20 });
    expect(normaliseRange(0, 0, { min: NaN, max: NaN })).toEqual({ min: 0, max: 1 });
  });
});

describe('buildModel – time series input', () => {
  it('reduces each series to one row with a sparkline and last time', () => {
    const frames = [
      toDataFrame({
        name: 'cpu',
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
          { name: 'Value', type: FieldType.number, values: [10, 20, 30], config: { unit: 'percent' } },
        ],
      }),
      toDataFrame({
        name: 'mem',
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
          {
            name: 'Value',
            type: FieldType.number,
            values: [5, null, 95],
            config: { max: 100, custom: { barStyle: 'sweep' } },
          },
        ],
      }),
    ];
    const m = buildModel(frames, opts({ reducer: ReducerID.lastNotNull }), theme);
    expect(m.fromTimeSeries).toBe(true);
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0].name).toBe('cpu');
    expect(m.rows[0].value).toBe(30);
    expect(m.rows[0].valueText).toBe('30%');
    expect(m.rows[0].sparkline).toEqual([10, 20, 30]);
    expect(m.rows[0].time).toBe(3000);
    expect(m.rows[0].style).toBe('percent');
    // second series: configured max wins, custom field style override applies
    expect(m.rows[1].max).toBe(100);
    expect(m.rows[1].percent).toBeCloseTo(0.95);
    expect(m.rows[1].style).toBe('sweep');
    expect(m.hasTime).toBe(true);
  });

  it('honours the reducer option', () => {
    const frames = [
      toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2, 3] },
          { name: 'v', type: FieldType.number, values: [1, 2, 3] },
        ],
      }),
    ];
    expect(buildModel(frames, opts({ reducer: ReducerID.mean }), theme).rows[0].value).toBe(2);
    expect(buildModel(frames, opts({ reducer: ReducerID.max }), theme).rows[0].value).toBe(3);
  });
});

describe('buildModel – table input', () => {
  const frame = toDataFrame({
    fields: [
      { name: 'name', type: FieldType.string, values: ['Edge Gateway', 'Core Switch', 'Backup Store'] },
      {
        name: 'progress',
        type: FieldType.number,
        values: [42, 94, null],
        config: { unit: 'percent', min: 0, max: 100 },
      },
      {
        name: 'status',
        type: FieldType.string,
        values: ['ok', 'crit', 'updating'],
        config: {
          mappings: [
            {
              type: MappingType.ValueToText,
              options: {
                ok: { text: 'Healthy', color: 'green', icon: 'check' },
                crit: { text: 'Critical', color: 'red' },
              },
            },
          ],
        },
      },
      { name: 'style', type: FieldType.string, values: ['percent', 'Bi-directional', 'nope'] },
      { name: 'version', type: FieldType.string, values: ['5.2.0', '7.0.50', '3.9.1'] },
      { name: 'trend', type: FieldType.string, values: ['1;2;3', '3,2,1', ''] },
      { name: 'updated', type: FieldType.time, values: [1_000, 2_000, 3_000] },
    ],
  });

  it('maps one row per table row with auto-detected columns', () => {
    const m = buildModel([frame], opts({ barStyle: 'segmented' }), theme);
    expect(m.fromTimeSeries).toBe(false);
    expect(m.rows.map((r) => r.name)).toEqual(['Edge Gateway', 'Core Switch', 'Backup Store']);
    expect(m.rows[0].valueText).toBe('42%');
    expect(m.rows[0].percent).toBeCloseTo(0.42);
    expect(Number.isNaN(m.rows[2].percent)).toBe(true);
    expect(m.hasStatus).toBe(true);
    expect(m.hasTime).toBe(true);
    expect(m.rows[0].time).toBe(1000);
    // extra columns = everything not consumed by a role (style/trend/status excluded)
    expect(m.extraColumns.map((c) => c.title)).toEqual(['version']);
    expect(m.rows[1].extras[0].text).toBe('7.0.50');
    // sparkline parsed from "1;2;3" style strings
    expect(m.rows[0].sparkline).toEqual([1, 2, 3]);
    expect(m.rows[1].sparkline).toEqual([3, 2, 1]);
    expect(m.rows[2].sparkline).toBeUndefined();
  });

  it('resolves style: style column > field override > panel default', () => {
    const m = buildModel([frame], opts({ barStyle: 'segmented' }), theme);
    expect(m.rows.map((r) => r.style)).toEqual(['percent', 'bidirectional', 'segmented']);

    const withOverride = toDataFrame({
      fields: [
        { name: 'name', type: FieldType.string, values: ['a'] },
        { name: 'v', type: FieldType.number, values: [1], config: { custom: { barStyle: 'striped' } } },
      ],
    });
    expect(buildModel([withOverride], opts({ barStyle: 'segmented' }), theme).rows[0].style).toBe('striped');
  });

  it('maps status through value mappings including icon, with keyword fallback', () => {
    const m = buildModel([frame], opts(), theme);
    expect(m.rows[0].status).toEqual({
      text: 'Healthy',
      color: theme.visualization.getColorByName('green'),
      icon: 'check',
    });
    expect(m.rows[1].status?.text).toBe('Critical');
    expect(m.rows[1].status?.color).toBe(theme.visualization.getColorByName('red'));
    // unmapped word falls back to a semantic colour
    expect(m.rows[2].status?.text).toBe('updating');
    expect(m.rows[2].status?.color).toBe(theme.colors.warning.main);
  });

  it('uses threshold colours for the bar in thresholds mode', () => {
    const f = toDataFrame({
      fields: [
        { name: 'name', type: FieldType.string, values: ['a', 'b', 'c'] },
        {
          name: 'v',
          type: FieldType.number,
          values: [10, 75, 95],
          config: {
            min: 0,
            max: 100,
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
    });
    const m = buildModel([f], opts({ colorMode: 'thresholds' }), theme);
    expect(m.rows.map((r) => r.color)).toEqual(
      ['green', 'orange', 'red'].map((c) => theme.visualization.getColorByName(c))
    );
    const fixed = buildModel([f], opts({ colorMode: 'fixed', fixedColor: 'purple' }), theme);
    expect(new Set(fixed.rows.map((r) => r.color)).size).toBe(1);
  });

  it('respects explicit column choices and stack fields', () => {
    const f = toDataFrame({
      fields: [
        { name: 'host', type: FieldType.string, values: ['h1'] },
        { name: 'used', type: FieldType.number, values: [48] },
        { name: 'cached', type: FieldType.number, values: [27] },
        { name: 'free', type: FieldType.number, values: [25] },
        { name: 'total', type: FieldType.number, values: [100] },
      ],
    });
    const m = buildModel(
      [f],
      opts({
        barStyle: 'stacked',
        nameField: 'host',
        valueField: 'total',
        stackFields: ['used', 'cached', 'free'],
        extraFields: ['total'],
      }),
      theme
    );
    const row = m.rows[0];
    expect(row.stack?.map((s) => s.label)).toEqual(['used', 'cached', 'free']);
    expect(row.stack?.map((s) => s.fraction)).toEqual([0.48, 0.27, 0.25]);
    expect(m.extraColumns).toEqual([{ title: 'total', numeric: true }]);
    expect(row.extras[0].numeric).toBe(100);
  });

  it('returns an empty model for no data', () => {
    expect(buildModel([], opts(), theme).rows).toHaveLength(0);
  });
});
