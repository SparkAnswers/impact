import { reduceValues } from '../lib/reducers';

describe('reduceValues', () => {
  const xs = [3, null, 1, undefined, 4, NaN, 1, 5];
  it('ignores nulls and NaN', () => {
    expect(reduceValues(xs, 'mean')).toBeCloseTo(14 / 5);
    expect(reduceValues(xs, 'last')).toBe(5);
    expect(reduceValues(xs, 'min')).toBe(1);
    expect(reduceValues(xs, 'max')).toBe(5);
    expect(reduceValues(xs, 'sum')).toBe(14);
    expect(reduceValues(xs, 'range')).toBe(4);
  });
  it('returns null for empty input', () => {
    expect(reduceValues([], 'mean')).toBeNull();
    expect(reduceValues([null, undefined], 'sum')).toBeNull();
  });
});
