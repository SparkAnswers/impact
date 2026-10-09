import { createTheme, FieldType, MappingType, ReducerID, toDataFrame, type Field } from '@grafana/data';
import { buildModel, isSafeHref, isTimeSeriesFrame, normaliseRange } from '../lib/rows';
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

describe('buildModel – data links', () => {
  /** Attaches a `getLinks` supplier like the panel pipeline does (one link per row, built from the row index). */
  const withLinks = (field: Field, hrefs: Array<string | string[]>) => {
    field.getLinks = ({ valueRowIndex = 0 }) =>
      ([] as string[]).concat(hrefs[valueRowIndex] ?? []).map((href, i) => ({
        href,
        title: `link ${i}`,
        target: i === 0 ? undefined : '_blank',
        origin: field,
      }));
    return field;
  };

  it('resolves links of every column at the row index, keeping only safe schemes', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'name', type: FieldType.string, values: ['a', 'b', 'c'] },
        { name: 'value', type: FieldType.number, values: [1, 2, 3] },
        { name: 'status', type: FieldType.string, values: ['ok', 'ok', 'ok'] },
        { name: 'updated', type: FieldType.time, values: [1, 2, 3] },
        { name: 'version', type: FieldType.string, values: ['1', '2', '3'] },
      ],
    });
    withLinks(frame.fields[0], ['/d/a', ['/d/b', 'https://example.org/b'], 'javascript:alert(1)']);
    withLinks(frame.fields[1], ['/explore?a', '', 'mailto:ops@example.org']);
    withLinks(frame.fields[2], [[], 'data:text/html,x', './status']);
    withLinks(frame.fields[3], ['#t', '#t', '#t']);
    withLinks(frame.fields[4], ['/v/1', 'vbscript:x', 'https://example.org/v/3']);

    const m = buildModel([frame], opts(), theme);
    expect(m.rows[0].links.name).toEqual([{ href: '/d/a', title: 'link 0', target: undefined, onClick: undefined }]);
    expect(m.rows[1].links.name?.map((l) => l.href)).toEqual(['/d/b', 'https://example.org/b']);
    expect(m.rows[1].links.name?.[1].target).toBe('_blank');
    // unsafe schemes and empty hrefs are dropped entirely
    expect(m.rows[2].links.name).toBeUndefined();
    expect(m.rows[1].links.value).toBeUndefined();
    expect(m.rows[1].links.status).toBeUndefined();
    expect(m.rows[1].links.extras[0]).toBeUndefined();
    // value, status, time and extra columns carry their own links
    expect(m.rows[0].links.value?.[0].href).toBe('/explore?a');
    expect(m.rows[2].links.value?.[0].href).toBe('mailto:ops@example.org');
    expect(m.rows[0].links.status).toBeUndefined();
    expect(m.rows[2].links.status?.[0].href).toBe('./status');
    expect(m.rows[1].links.time?.[0].href).toBe('#t');
    expect(m.rows[0].links.extras[0]?.[0].href).toBe('/v/1');
    expect(m.rows[2].links.extras[0]?.[0].href).toBe('https://example.org/v/3');
    // fields without a link supplier yield plain cells
    expect(m.rows[0].links.subtitle).toBeUndefined();
    expect(m.rows[0].links.sparkline).toBeUndefined();
  });

  it('takes the links of a time series from its value field at the last index and applies them to the row', () => {
    const frame = toDataFrame({
      name: 'cpu',
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'Value', type: FieldType.number, values: [1, 2, 3] },
      ],
    });
    const getLinks = jest.fn(({ valueRowIndex }: { valueRowIndex?: number }) => [
      { href: `/d/cpu?row=${valueRowIndex}`, title: 'Series', target: undefined, origin: frame.fields[1] },
    ]);
    frame.fields[1].getLinks = getLinks;
    const m = buildModel([frame], opts(), theme);
    expect(getLinks).toHaveBeenCalledWith({ valueRowIndex: 2 });
    const expected = [{ href: '/d/cpu?row=2', title: 'Series', target: undefined, onClick: undefined }];
    expect(m.rows[0].links.name).toEqual(expected);
    expect(m.rows[0].links.value).toEqual(expected);
    expect(m.rows[0].links.time).toEqual(expected);
  });

  it('keeps Grafana link handlers and falls back to the href as title', () => {
    const onClick = jest.fn();
    const frame = toDataFrame({
      fields: [
        { name: 'name', type: FieldType.string, values: ['a'] },
        { name: 'value', type: FieldType.number, values: [1] },
      ],
    });
    frame.fields[0].getLinks = () => [
      { href: '/explore', title: '', target: undefined, origin: frame.fields[0], onClick },
    ];
    const link = buildModel([frame], opts(), theme).rows[0].links.name?.[0];
    expect(link?.title).toBe('/explore');
    expect(link?.onClick).toBe(onClick);
  });
});

describe('isSafeHref', () => {
  it('allows http(s), mailto and relative URLs only', () => {
    for (const ok of [
      'https://example.org',
      'HTTP://example.org',
      'mailto:a@b.c',
      '/d/x',
      './x',
      '../x',
      '?a=1',
      '#x',
      'd/x',
    ]) {
      expect(isSafeHref(ok)).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', 'JavaScript:x', 'data:text/html,x', 'vbscript:x', 'ftp://x', '', '  ']) {
      expect(isSafeHref(bad)).toBe(false);
    }
  });

  it('sees through control characters, tabs and newlines that browsers strip before parsing', () => {
    for (const bad of ['java\tscript:alert(1)', 'java\nscript:x', '\u0001javascript:x', ' \u0000data:text/html,x', 'jav\u000Dascript:x']) {
      expect(isSafeHref(bad)).toBe(false);
    }
    expect(isSafeHref('\u0001https://example.org')).toBe(true);
  });
});

describe('series-valued extra columns', () => {
  it('become sparklines whose text and sort value are the last point, formatted with the column unit', () => {
    const trend = toDataFrame({ fields: [{ name: 'Time', type: FieldType.time, values: [1, 2, 3] }, { name: 'mem', type: FieldType.number, values: [1024, 2048, 4096] }] });
    const frame = toDataFrame({
      fields: [
        { name: 'name', type: FieldType.string, values: ['a'] },
        { name: 'cpu', type: FieldType.number, values: [12] },
        { name: 'Memory', type: FieldType.frame, values: [trend], config: { unit: 'bytes', decimals: 0 } },
      ],
    });
    const model = buildModel([frame], opts({ extraFields: ['Memory'] }), theme);
    expect(model.extraColumns.map((c) => c.numeric)).toEqual([true]);
    const cell = model.rows[0].extras[0];
    expect(cell.series).toEqual([1024, 2048, 4096]);
    expect(cell.numeric).toBe(4096);
    expect(cell.text).toBe('4 KiB');
  });

  it('are picked up automatically as unused frame fields', () => {
    const trend = toDataFrame({ fields: [{ name: 'v', type: FieldType.number, values: [1, 2] }] });
    const frame = toDataFrame({
      fields: [
        { name: 'name', type: FieldType.string, values: ['a'] },
        { name: 'cpu', type: FieldType.number, values: [12] },
        { name: 'history', type: FieldType.frame, values: [trend] },
        { name: 'other', type: FieldType.frame, values: [trend] },
      ],
    });
    const model = buildModel([frame], opts({ sparklineField: 'history' }), theme);
    expect(model.rows[0].sparkline).toEqual([1, 2]);
    expect(model.extraColumns.map((c) => c.title)).toEqual(['other']);
    expect(model.rows[0].extras[0].series).toEqual([1, 2]);
  });
});
