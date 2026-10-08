import { dateTime, FieldType, toDataFrame } from '@grafana/data';
import { extractSeries } from '../lib/data';

const frame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1000, 2000, 3000, 4000, 5000] },
    { name: 'label', type: FieldType.string, values: ['a', 'b', 'c', 'd', 'e'] },
    { name: 'power', type: FieldType.number, values: [1, -2, null, 4, 5] },
    { name: 'other', type: FieldType.number, values: [10, 20, 30, 40, 50] },
  ],
});

describe('extractSeries', () => {
  it('uses the first numeric field and the last non-null value', () => {
    const s = extractSeries([frame], { source: 'lastN', points: 3 });
    expect(s?.field.name).toBe('power');
    expect(s?.current).toBe(5);
    expect(s?.windowValues).toEqual([-2, 4, 5]);
    expect(s?.history.map((p) => p.x)).toEqual([0, 0.5, 1]);
    expect(s?.dataMin).toBe(-2);
    expect(s?.dataMax).toBe(5);
  });
  it('selects a field by name', () => {
    expect(extractSeries([frame], { source: 'lastN', points: 10, fieldName: 'other' })?.current).toBe(50);
  });
  it('positions samples by time inside the panel range', () => {
    const timeRange = { from: dateTime(0), to: dateTime(5000), raw: { from: 'now-5s', to: 'now' } };
    const s = extractSeries([frame], { source: 'timeRange', points: 10, timeRange });
    expect(s?.history.map((p) => p.x)).toEqual([0.2, 0.4, 0.8, 1]);
    expect(s?.windowValues).toEqual([1, -2, 4, 5]);
  });
  it('filters to the time range', () => {
    const timeRange = { from: dateTime(3500), to: dateTime(6000), raw: { from: '', to: '' } };
    const s = extractSeries([frame], { source: 'timeRange', points: 10, timeRange });
    expect(s?.windowValues).toEqual([4, 5]);
  });
  it('returns null without numeric fields', () => {
    const empty = toDataFrame({ fields: [{ name: 'label', type: FieldType.string, values: ['x'] }] });
    expect(extractSeries([empty], { source: 'lastN', points: 10 })).toBeNull();
  });
});
