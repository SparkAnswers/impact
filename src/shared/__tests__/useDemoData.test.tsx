import { renderHook } from '@testing-library/react';
import {
  createTheme,
  dateTime,
  FieldType,
  LoadingState,
  toDataFrame,
  type DataFrame,
  type PanelData,
} from '@grafana/data';
import {
  demoWindow,
  deviceTableWithStyles,
  hasUsableData,
  isDemoMode,
  rollingMultiSeries,
  rollingSignedPowerSeries,
  signedPowerAt,
  smoothNoise,
  useDemoFrames,
  type DemoGenerator,
  type DemoMode,
} from '../demo';

const NOW = 1_760_000_000_000;
const MIN = 60_000;
const theme = createTheme();
const replaceVariables = (s: string) => s;
const fieldConfig = { defaults: { decimals: 3 }, overrides: [] };

function panelData(series: DataFrame[], from = NOW - 15 * MIN, to = NOW): PanelData {
  return {
    series,
    state: LoadingState.Done,
    timeRange: { from: dateTime(from), to: dateTime(to), raw: { from: 'now-15m', to: 'now' } },
  };
}

const realFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [NOW - MIN, NOW] },
    { name: 'value', type: FieldType.number, values: [1, 2] },
  ],
});

const generator: DemoGenerator = jest.fn((w) => [rollingSignedPowerSeries(w.now, w.durationMs, w.stepMs)]);

function run(data: PanelData, mode: DemoMode | undefined, extra: Record<string, unknown> = {}) {
  return renderHook(
    (p: { data: PanelData; mode: DemoMode | undefined }) =>
      useDemoFrames(p.data, p.mode, generator, {
        fieldConfig,
        replaceVariables,
        theme,
        timeZone: 'utc',
        ...extra,
      }),
    { initialProps: { data, mode } }
  );
}

describe('demoWindow', () => {
  it('ends at the range end, is at least 15 minutes long and uses 1 s steps for short ranges', () => {
    const w = demoWindow(NOW - 5 * MIN, NOW);
    expect(w).toEqual({ now: NOW, from: NOW - 15 * MIN, durationMs: 15 * MIN, stepMs: 1000 });
  });
  it('covers longer ranges with a coarser cadence near 10k points', () => {
    const w = demoWindow(NOW - 6 * 60 * MIN, NOW);
    expect(w.durationMs).toBe(6 * 60 * MIN);
    expect(w.stepMs).toBe(3000);
    expect(w.durationMs / w.stepMs).toBeLessThanOrEqual(10_000);
  });
  it('falls back to the wall clock without a range', () => {
    expect(demoWindow(undefined, undefined, NOW).now).toBe(NOW);
    expect(demoWindow(undefined, NaN, NOW).now).toBe(NOW);
  });
});

describe('hasUsableData / isDemoMode', () => {
  it('rejects empty results and frames without number or string fields', () => {
    expect(hasUsableData(undefined)).toBe(false);
    expect(hasUsableData([])).toBe(false);
    expect(hasUsableData([toDataFrame({ fields: [{ name: 'time', type: FieldType.time, values: [1] }] })])).toBe(false);
    expect(hasUsableData([toDataFrame({ fields: [{ name: 'v', type: FieldType.number, values: [] }] })])).toBe(false);
    expect(hasUsableData([realFrame])).toBe(true);
  });
  it('isDemoMode accepts only the three modes', () => {
    expect(['off', 'whenNoData', 'always'].every(isDemoMode)).toBe(true);
    expect(isDemoMode(undefined)).toBe(false);
    expect(isDemoMode('query')).toBe(false);
  });
});

describe('useDemoFrames', () => {
  beforeEach(() => (generator as jest.Mock).mockClear());

  it('passes real data through untouched in every mode except always', () => {
    for (const mode of ['off', 'whenNoData', undefined] as const) {
      const { result } = run(panelData([realFrame]), mode);
      expect(result.current.isDemo).toBe(false);
      expect(result.current.frames).toBe(result.current.frames);
      expect(result.current.frames[0]).toBe(realFrame);
    }
    expect(generator).not.toHaveBeenCalled();
  });

  it('generates when there is no data in whenNoData (also the default for a missing option)', () => {
    for (const mode of ['whenNoData', undefined] as const) {
      const { result } = run(panelData([]), mode);
      expect(result.current.isDemo).toBe(true);
      expect(result.current.frames).toHaveLength(1);
      expect(result.current.frames[0].fields[1].name).toBe('power');
    }
  });

  it('never generates in off, even with no data', () => {
    const { result } = run(panelData([]), 'off');
    expect(result.current.isDemo).toBe(false);
    expect(result.current.frames).toEqual([]);
    expect(generator).not.toHaveBeenCalled();
  });

  it('ignores the query in always', () => {
    const { result } = run(panelData([realFrame]), 'always');
    expect(result.current.isDemo).toBe(true);
    expect(result.current.frames[0]).not.toBe(realFrame);
  });

  it('honours a custom usability test', () => {
    const { result } = run(panelData([realFrame]), 'whenNoData', { isUsable: () => false });
    expect(result.current.isDemo).toBe(true);
  });

  it('runs the frames through applyFieldOverrides: display processors and panel defaults apply', () => {
    const { result } = run(panelData([]), 'always');
    const field = result.current.frames[0].fields[1];
    expect(typeof field.display).toBe('function');
    // Generated fields carry no config of their own, so the panel's fieldConfig.defaults (unit, min, max,
    // decimals) are what applyFieldOverrides applies; a field-level unit would silently win over them.
    expect(field.config.unit).toBeUndefined();
    expect(field.config.min).toBeUndefined();
    expect(field.state?.displayName ?? field.name).toBeTruthy();
  });

  it('anchors the window at the end of the panel time range with 1 s cadence over the last 15 min', () => {
    const { result } = run(panelData([]), 'always');
    const time = result.current.frames[0].fields[0].values as number[];
    expect(time[time.length - 1]).toBe(NOW);
    expect(time[0]).toBe(NOW - 15 * MIN);
    expect(time[1] - time[0]).toBe(1000);
    expect(time).toHaveLength(901);
  });

  it('prefers deps.timeRange over data.timeRange as the anchor', () => {
    const later = NOW + 30_000;
    const { result } = run(panelData([]), 'always', {
      timeRange: { from: dateTime(later - 15 * MIN), to: dateTime(later), raw: { from: 'now-15m', to: 'now' } },
    });
    const time = result.current.frames[0].fields[0].values as number[];
    expect(time[time.length - 1]).toBe(later);
  });

  it('is memoised on data.series and the range, and regenerates when either changes', () => {
    const data = panelData([]);
    const { result, rerender } = run(data, 'whenNoData');
    const first = result.current.frames;
    rerender({ data, mode: 'whenNoData' });
    expect(result.current.frames).toBe(first);
    expect(generator).toHaveBeenCalledTimes(1);

    rerender({ data: panelData([]), mode: 'whenNoData' });
    expect(result.current.frames).not.toBe(first);
    expect(generator).toHaveBeenCalledTimes(2);

    rerender({ data: panelData([], NOW - 15 * MIN + 10_000, NOW + 10_000), mode: 'whenNoData' });
    expect(generator).toHaveBeenCalledTimes(3);
    const time = result.current.frames[0].fields[0].values as number[];
    expect(time[time.length - 1]).toBe(NOW + 10_000);
  });

  it('keeps values stable at the same instants when the window slides (time-anchored data)', () => {
    const a = rollingSignedPowerSeries(NOW, 15 * MIN, 1000);
    const b = rollingSignedPowerSeries(NOW + 10_000, 15 * MIN, 1000);
    const ta = a.fields[0].values as number[];
    const va = a.fields[1].values as number[];
    const tb = b.fields[0].values as number[];
    const vb = b.fields[1].values as number[];
    const idx = tb.indexOf(ta[ta.length - 1]);
    expect(idx).toBeGreaterThan(0);
    expect(vb.slice(0, idx + 1)).toEqual(va.slice(ta.length - 1 - idx));
  });
});

describe('rolling generators', () => {
  it('smoothNoise is deterministic, bounded and continuous', () => {
    expect(smoothNoise(NOW, 20_000)).toBe(smoothNoise(NOW, 20_000));
    for (let t = NOW; t < NOW + 200_000; t += 997) {
      const v = smoothNoise(t, 20_000);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(smoothNoise(t + 50, 20_000) - v)).toBeLessThan(0.05);
    }
    expect(smoothNoise(NOW, 20_000, 1)).not.toBe(smoothNoise(NOW, 20_000, 2));
  });

  it('signedPowerAt stays within -20..20 and crosses zero over 15 minutes', () => {
    const vs: number[] = [];
    for (let t = NOW; t < NOW + 15 * MIN; t += 1000) {
      vs.push(signedPowerAt(t));
    }
    expect(vs.every((v) => v >= -20 && v <= 20)).toBe(true);
    expect(vs.some((v) => v > 0) && vs.some((v) => v < 0)).toBe(true);
  });

  it('rollingSignedPowerSeries snaps timestamps to the step grid', () => {
    const f = rollingSignedPowerSeries(NOW + 1234, 60_000, 1000);
    const time = f.fields[0].values as number[];
    expect(time[time.length - 1]).toBe(NOW + 1000);
    expect(time).toHaveLength(61);
    expect(f.fields[1].config).toEqual({});
  });

  it('rollingMultiSeries returns n distinct bounded frames with shared timestamps', () => {
    const frames = rollingMultiSeries(3, NOW, 15 * MIN, 5000, { names: ['a', 'b'], min: 10, max: 50 });
    expect(frames.map((f) => f.name)).toEqual(['a', 'b', 'series-3']);
    expect(frames[1].fields[0].values).toEqual(frames[0].fields[0].values);
    expect(frames[1].fields[1].values).not.toEqual(frames[0].fields[1].values);
    for (const f of frames) {
      expect((f.fields[1].values as number[]).every((v) => v >= 10 && v <= 50)).toBe(true);
    }
    expect(rollingMultiSeries(0, NOW, MIN, 1000)).toEqual([]);
  });

  it('deviceTableWithStyles cycles through every bar style and keeps the other columns', () => {
    const f = deviceTableWithStyles(12, { now: NOW });
    expect(f.fields.map((x) => x.name)).toEqual([
      'name',
      'progress',
      'status',
      'style',
      'version',
      'channel',
      'updated',
      'trend',
    ]);
    const styles = f.fields[3].values as string[];
    expect(new Set(styles)).toEqual(
      new Set(['percent', 'segmented', 'striped', 'sweep', 'bidirectional', 'stacked', 'sparkline', 'pill'])
    );
    const progress = f.fields[1].values as Array<number | null>;
    styles.forEach((s, i) => {
      if (s === 'sweep' || s === 'pill') {
        expect(progress[i]).toBeNull();
      } else {
        expect(typeof progress[i]).toBe('number');
      }
    });
    expect(f.fields[3].values).toEqual(deviceTableWithStyles(12, { now: NOW }).fields[3].values);
  });
});
