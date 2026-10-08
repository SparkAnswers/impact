import { generateTicks, niceStep, parseTickList } from '../lib/ticks';

describe('niceStep', () => {
  it('rounds to 1/2/2.5/5 multiples', () => {
    expect(niceStep(0.9)).toBe(1);
    expect(niceStep(1.4)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(37)).toBe(50);
    expect(niceStep(60)).toBe(100);
    expect(niceStep(0)).toBe(1);
  });
});

describe('generateTicks', () => {
  it('includes min, max and the zero mark', () => {
    const t = generateTicks({ min: -50, max: 200, zero: 0, kind: 'sqrt' });
    expect(t).toEqual([-50, 0, 50, 100, 150, 200]);
  });
  it('works for a purely positive range', () => {
    expect(generateTicks({ min: 0, max: 100, zero: 0, kind: 'linear' })).toEqual([0, 25, 50, 75, 100]);
  });
  it('drops ticks that crowd the ends', () => {
    const t = generateTicks({ min: -5, max: 10, zero: 0, kind: 'linear' });
    expect(t[0]).toBe(-5);
    expect(t[t.length - 1]).toBe(10);
    expect(t).toContain(0);
    expect(t).toEqual([-5, -2.5, 0, 2.5, 5, 7.5, 10]);
  });
  it('handles fractional ranges', () => {
    const t = generateTicks({ min: 0, max: 1, zero: 0, kind: 'linear' });
    expect(t).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe('parseTickList', () => {
  it('parses comma/space separated numbers and ignores junk', () => {
    expect(parseTickList('-50, 0 50;100 abc 200')).toEqual([-50, 0, 50, 100, 200]);
    expect(parseTickList('')).toEqual([]);
    expect(parseTickList(undefined)).toEqual([]);
  });
});

describe('decimalsNeeded', () => {
  it('uses the minimum decimals for the tick values', () => {
    const { decimalsNeeded } = jest.requireActual('../lib/ticks');
    expect(decimalsNeeded([-50, 0, 100, 200])).toBe(0);
    expect(decimalsNeeded([-5, -2.5, 0, 2.5])).toBe(1);
    expect(decimalsNeeded([0, 0.25, 0.5])).toBe(2);
    expect(decimalsNeeded([])).toBe(0);
  });
});
