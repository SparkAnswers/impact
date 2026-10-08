import { createTheme, FieldType, toDataFrame } from '@grafana/data';
import { applyBinding, fieldNames, formatValue, indexFields, lastValue } from '../lib/data';

const theme = createTheme();
const frame = toDataFrame({
  refId: 'A',
  fields: [
    { name: 'time', type: FieldType.time, values: [1, 2, 3] },
    { name: 'solar_kw', type: FieldType.number, values: [1, 2, null], config: { unit: 'kwatt', decimals: 1, min: 0, max: 10 } },
    { name: 'battery_kw', type: FieldType.number, values: [3, -4, -2.5], config: {} },
    { name: 'note', type: FieldType.string, values: ['a', 'b', 'c'] },
  ],
});

describe('data helpers', () => {
  it('lastValue skips nulls', () => {
    expect(lastValue(frame.fields[1])).toBe(2);
    expect(lastValue(frame.fields[2])).toBe(-2.5);
  });
  it('lists numeric field display names only', () => {
    expect(fieldNames([frame])).toEqual(['solar_kw', 'battery_kw']);
  });
  it('formats with the field display processor (unit + decimals)', () => {
    const fields = indexFields([frame], theme);
    expect(formatValue(fields.get('solar_kw'))).toBe('2.0 kW');
    expect(formatValue(fields.get('solar_kw'), 'Now ${value}')).toBe('Now 2.0 kW');
    expect(formatValue(fields.get('missing'))).toBeUndefined();
  });
  it('maps a bound value to speed using min/max and reverses below zero', () => {
    const fields = indexFields([frame], theme);
    const speed = applyBinding({ field: 'solar_kw', mapTo: 'speed' }, fields);
    // 2 of 0..10 (from field config) → 0.2
    expect(speed.speed).toBeCloseTo(0.15 + 0.2 * 2.85);
    expect(speed.reversed).toBe(false);
    const rev = applyBinding({ field: 'battery_kw', mapTo: 'width', min: 0, max: 5, reverseBelowZero: true }, fields);
    expect(rev.reversed).toBe(true);
    expect(rev.width).toBeCloseTo(1 + 0.5 * 5);
    const noRev = applyBinding({ field: 'battery_kw', mapTo: 'width', min: 0, max: 5 }, fields);
    expect(noRev.reversed).toBe(false);
  });
  it('maps colour through the display processor', () => {
    const fields = indexFields([frame], theme);
    const res = applyBinding({ field: 'solar_kw', mapTo: 'color' }, fields);
    expect(typeof res.color).toBe('string');
    expect(applyBinding(undefined, fields)).toEqual({ reversed: false });
    expect(applyBinding({ field: 'nope', mapTo: 'color' }, fields)).toEqual({ reversed: false });
  });
});
