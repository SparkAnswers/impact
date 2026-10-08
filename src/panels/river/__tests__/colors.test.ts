import { createColorMapper, parseColor, rgbCss } from '../lib/colors';

describe('colour scales', () => {
  it('parses hex and rgb strings', () => {
    expect(parseColor('#ff0000')).toEqual([255, 0, 0]);
    expect(parseColor('#0f0')).toEqual([0, 255, 0]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColor('rgba(4 5 6 / 0.5)')).toEqual([4, 5, 6]);
    expect(rgbCss([1.4, 2.6, 3])).toBe('rgb(1,3,3)');
  });

  it('preset scale maps the domain linearly', () => {
    const m = createColorMapper({ preset: 'viridis', domain: [0, 10] });
    expect(m.toT(0)).toBe(0);
    expect(m.toT(5)).toBeCloseTo(0.5);
    expect(m.toT(20)).toBe(1);
    expect(m.rgb(0)).toEqual([68, 1, 84]);
    expect(m.rgb(10)).toEqual([253, 231, 37]);
    expect(m.ticks).toHaveLength(5);
    expect(m.ticks[2].value).toBe(5);
    expect(m.gradient.startsWith('linear-gradient(90deg,rgb(68,1,84)')).toBe(true);
  });

  it('custom stops interpolate exactly at and between stops', () => {
    const m = createColorMapper({
      preset: 'custom',
      customStops: [
        { value: 0, color: '#000000' },
        { value: 10, color: '#ff0000' },
        { value: 100, color: '#ffffff' },
      ],
      domain: [0, 1],
    });
    expect(m.domain).toEqual([0, 100]);
    expect(m.rgb(0)).toEqual([0, 0, 0]);
    expect(m.rgb(10)).toEqual([255, 0, 0]);
    expect(m.rgb(100)).toEqual([255, 255, 255]);
    // piecewise: 5 is halfway between stop 0 and 1 -> t = 0.25
    expect(m.toT(5)).toBeCloseTo(0.25);
    expect(m.rgb(5).map(Math.round)).toEqual([128, 0, 0]);
    expect(m.toT(55)).toBeCloseTo(0.75);
    expect(m.ticks.map((t) => t.value)).toEqual([0, 10, 100]);
  });

  it('thresholds scale is stepped and resolves named colours', () => {
    const m = createColorMapper({
      preset: 'thresholds',
      domain: [0, 100],
      thresholds: [
        { value: -Infinity, color: 'green' },
        { value: 50, color: 'orange' },
        { value: 80, color: 'red' },
      ],
      resolveColor: (c) => ({ green: '#00ff00', orange: '#ffa500', red: '#ff0000' })[c] ?? c,
    });
    expect(m.stepped).toBe(true);
    expect(m.rgb(10)).toEqual([0, 255, 0]);
    expect(m.rgb(50)).toEqual([255, 165, 0]);
    expect(m.rgb(79.9)).toEqual([255, 165, 0]);
    expect(m.rgb(80)).toEqual([255, 0, 0]);
    expect(m.rgb(1000)).toEqual([255, 0, 0]);
    expect(m.ticks.map((t) => t.value)).toEqual([0, 50, 80, 100]);
    expect(m.gradient).toContain('rgb(255,165,0) 50.00%');
  });

  it('falls back safely for degenerate domains and too few stops', () => {
    const m = createColorMapper({ preset: 'turbo', domain: [5, 5] });
    expect(m.domain[1]).toBeGreaterThan(m.domain[0]);
    const c = createColorMapper({ preset: 'custom', customStops: [{ value: 1, color: '#fff' }], domain: [0, 1] });
    expect(c.preset).toBe('turbo');
  });
});

import { trailKeep } from '../lib/render';

describe('trail fade', () => {
  it('is normalised to 60 fps', () => {
    expect(trailKeep(0.9, 1 / 60)).toBeCloseTo(0.9, 6);
    expect(trailKeep(0.9, 1 / 30)).toBeCloseTo(0.81, 6);
    expect(trailKeep(0.9, 1 / 120)).toBeCloseTo(Math.sqrt(0.9), 6);
  });
});
