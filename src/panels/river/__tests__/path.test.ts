import { PATH_PRESETS, autoWindow, buildCentreline, catmullRom, pointAt, presetWaypoints, smoothSample, smoothSeries } from '../lib/path';

describe('path geometry', () => {
  it('resamples by arc length with monotonic cumulative length', () => {
    const c = buildCentreline(PATH_PRESETS.scurve, 800, 400, 300);
    expect(c.M).toBe(300);
    expect(c.L).toBeGreaterThan(700);
    for (let i = 1; i < c.M; i++) {
      expect(c.S[i]).toBeGreaterThan(c.S[i - 1]);
    }
    // evenly spaced: segment lengths roughly equal
    const seg = c.L / (c.M - 1);
    for (let i = 1; i < c.M; i++) {
      const d = Math.hypot(c.X[i] - c.X[i - 1], c.Y[i] - c.Y[i - 1]);
      expect(Math.abs(d - seg)).toBeLessThan(seg * 0.25);
    }
    expect(c.S[c.M - 1]).toBeCloseTo(c.L, 3);
  });

  it('straight horizontal path has length equal to its span and unit tangents', () => {
    const c = buildCentreline(PATH_PRESETS.horizontal, 1000, 100, 200);
    expect(c.L).toBeCloseTo(940, 0);
    for (let i = 0; i < c.M; i++) {
      expect(Math.hypot(c.TX[i], c.TY[i])).toBeCloseTo(1, 5);
      expect(c.TX[i]).toBeCloseTo(1, 3);
    }
    expect(c.X[0]).toBeCloseTo(30, 3);
    expect(c.X[c.M - 1]).toBeCloseTo(970, 3);
  });

  it('catmullRom passes through the end points', () => {
    const pts = catmullRom(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
      ],
      20
    );
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 20, y: 0 });
  });

  it('smoothSample interpolates monotonically between samples', () => {
    expect(smoothSample([0, 10], 0)).toBe(0);
    expect(smoothSample([0, 10], 1)).toBe(10);
    expect(smoothSample([0, 10], 0.5)).toBeCloseTo(5, 5);
    expect(smoothSample([7], 0.3)).toBe(7);
    expect(smoothSample([], 0.3)).toBe(0);
  });

  it('pointAt offsets laterally to the left of travel', () => {
    const c = buildCentreline(PATH_PRESETS.horizontal, 100, 100, 50);
    const p = pointAt(c, 0.5, 10);
    expect(p.y).toBeCloseTo(60, 3);
  });

  it('presets are within 0..1 and copied', () => {
    for (const k of ['horizontal', 'scurve', 'diagonal', 'u'] as const) {
      const w = presetWaypoints(k);
      expect(w.length).toBeGreaterThanOrEqual(4);
      for (const p of w) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
      w[0].x = 99;
      expect(PATH_PRESETS[k][0].x).not.toBe(99);
    }
  });
});


describe('smoothing', () => {
  it('auto window is 5% of the samples with a minimum of 3', () => {
    expect(autoWindow(10)).toBe(3);
    expect(autoWindow(400)).toBe(20);
    expect(autoWindow(400, 7)).toBe(7);
  });

  it('smoothSeries preserves constants, reduces noise and keeps the mean', () => {
    expect(smoothSeries([5, 5, 5, 5], 3)).toEqual([5, 5, 5, 5]);
    const noisy = Array.from({ length: 200 }, (_, i) => (i % 2 ? 10 : 0));
    const sm = smoothSeries(noisy, 9);
    const varOf = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length;
    };
    expect(varOf(sm)).toBeLessThan(varOf(noisy) / 10);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(sm)).toBeCloseTo(mean(noisy), 0);
    expect(smoothSeries([1, 2], 5)).toEqual([1, 2]);
  });
});
