import { type DataFrame, FieldType, createTheme, toDataFrame } from '@grafana/data';
import { bindChannels, effectiveChannels, findFrameIndex, getNumericFields } from '../lib/data';
import { allocateParticles } from '../lib/render';
import { createChannel } from '../types';

const frame = (refId: string, name: string, values: number[]): DataFrame =>
  toDataFrame({
    refId,
    fields: [
      { name: 'time', type: FieldType.time, values: values.map((_, i) => i * 1000) },
      { name, type: FieldType.number, values },
    ],
  });

const frames = [frame('A', 'alpha', [1, 2, 3]), frame('B', 'beta', [-5, -6, -7]), frame('C', 'gamma', [9, 8])];

describe('series binding', () => {
  it('lists numeric fields in order with display names', () => {
    expect(getNumericFields(frames).map((f) => f.displayName)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('finds frames by refId, name or index', () => {
    expect(findFrameIndex(frames, 'B')).toBe(1);
    expect(findFrameIndex(frames, '2')).toBe(2);
    expect(findFrameIndex(frames, 'nope')).toBe(-1);
    expect(findFrameIndex(frames, '')).toBe(-1);
  });

  it('creates a default S-curve channel bound to the first series', () => {
    const chans = effectiveChannels({ channels: [] });
    expect(chans).toHaveLength(1);
    expect(chans[0].path.length).toBeGreaterThan(4);
    const [b] = bindChannels(chans, frames);
    expect(b.lanes).toHaveLength(1);
    expect(b.lanes[0].values).toEqual([1, 2, 3]);
    expect(b.latest).toBe(3);
    expect(b.range).toEqual([1, 3]);
    expect(b.direction).toBe(1);
  });

  it('auto-binds channel i to series i when nothing is chosen', () => {
    const chans = effectiveChannels({
      channels: [createChannel({ id: 'a' }), createChannel({ id: 'b' }), createChannel({ id: 'c' })],
    });
    const bound = bindChannels(chans, frames);
    expect(bound.map((b) => b.lanes[0].name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('binds explicitly by series refId and by field name', () => {
    const chans = effectiveChannels({
      channels: [
        createChannel({ id: 'a', speedSource: { mode: 'series', series: 'C' } }),
        createChannel({ id: 'b', speedSource: { mode: 'field', field: 'alpha' } }),
        createChannel({ id: 'c', speedSource: { mode: 'fixed', fixed: 42 } }),
      ],
    });
    const bound = bindChannels(chans, frames);
    expect(bound[0].lanes[0].values).toEqual([9, 8]);
    expect(bound[1].lanes[0].values).toEqual([1, 2, 3]);
    expect(bound[2].lanes[0].values).toEqual([42]);
    expect(bound[2].field).toBeUndefined();
  });

  it('stacks all series as parallel lanes for a single channel', () => {
    const chans = effectiveChannels({ channels: [createChannel({ id: 'a', multiSeries: 'lanes' })] });
    const [b] = bindChannels(chans, frames);
    expect(b.lanes.map((l) => l.name)).toEqual(['alpha', 'beta', 'gamma']);
    expect(b.range).toEqual([-7, 9]);
  });

  it('flows backwards when direction is by sign and values are negative', () => {
    const chans = effectiveChannels({
      channels: [createChannel({ id: 'a', speedSource: { mode: 'series', series: 'B' }, direction: 'bySign' })],
    });
    const [b] = bindChannels(chans, frames);
    expect(b.direction).toBe(-1);
  });

  it('derives width multipliers from a width source', () => {
    const chans = effectiveChannels({
      channels: [createChannel({ id: 'a', widthSource: { mode: 'series', series: 'C' } })],
    });
    const [b] = bindChannels(chans, frames);
    expect(b.widths).toEqual([1, 8 / 9]);
  });

  it('caps the particle budget proportionally', () => {
    expect(allocateParticles([100, 300], 1000)).toEqual([100, 300]);
    const capped = allocateParticles([30000, 10000], 20000);
    expect(capped[0] + capped[1]).toBeLessThanOrEqual(20000);
    expect(capped[0]).toBe(15000);
  });
});

import { createColorMapper } from '../lib/colors';
import { legendFormatter } from '../lib/format';

describe('legend formatting', () => {
  const theme = createTheme();
  it('separates the unit suffix and drops decimals for whole ticks', () => {
    const f = frame('A', 'speed', [0, 8, 16]);
    f.fields[1].config = { unit: 'velocitymph' };
    const mapper = createColorMapper({ preset: 'turbo', domain: [0, 16] });
    const lf = legendFormatter(mapper, f.fields[1], { defaults: {}, overrides: [] }, theme);
    expect(lf.unit).toBe('mph');
    expect(mapper.ticks.map((t) => lf.format(t.value))).toEqual(['0', '4', '8', '12', '16']);
  });
  it('honours configured decimals', () => {
    const f = frame('A', 'speed', [0, 1]);
    f.fields[1].config = { unit: 'percent', decimals: 1 };
    const mapper = createColorMapper({ preset: 'turbo', domain: [0, 1] });
    const lf = legendFormatter(mapper, f.fields[1], { defaults: {}, overrides: [] }, theme);
    expect(lf.unit).toBe('%');
    expect(lf.format(0.25)).toBe('0.3');
    expect(mapper.ticks.map((t) => lf.format(t.value))).toEqual(['0.0', '0.3', '0.5', '0.8', '1.0']);
  });
});
